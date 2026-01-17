import { Octokit } from '@octokit/core'
import { throttling } from '@octokit/plugin-throttling'
import { retry } from '@octokit/plugin-retry'
import type { H3Event } from 'h3'
import type { EndpointDefaults } from '@octokit/types'

const OctokitWithPlugins = Octokit.plugin(throttling, retry)

interface OctokitOptions {
  retries?: number
  retryAfter?: number
  timeout?: number
}

// Proper type for GitHub API errors
interface OctokitError extends Error {
  status?: number
  code?: string
  response?: {
    status?: number
    headers?: Record<string, string>
  }
  headers?: Record<string, string>
}

// Type guard for OctokitError
function isOctokitError(err: unknown): err is OctokitError {
  return err instanceof Error
}

const defaultOptions: Required<OctokitOptions> = {
  retries: 5,
  retryAfter: 15,
  timeout: 60_000
}

export function createGithubClient(accessToken: string, options: OctokitOptions = {}) {
  const opts = { ...defaultOptions, ...options }

  return new OctokitWithPlugins({
    auth: accessToken,
    userAgent: 'gh-release-feed',
    request: {
      timeout: opts.timeout,
      retries: opts.retries,
      retryAfter: opts.retryAfter
    },
    retry: {
      doNotRetry: [400, 401, 403, 404, 422]
    },
    throttle: {
      onRateLimit: (retryAfter: number, options: Required<EndpointDefaults>, octokitInstance: Octokit, retryCount: number) => {
        octokitInstance.log.warn(`Request quota exhausted for request ${options.method} ${options.url} (retry ${retryCount})`)
        // Retry up to 3 times for rate limit
        if (retryCount < 3) return true
        return false
      },
      onSecondaryRateLimit: (retryAfter: number, options: Required<EndpointDefaults>, octokitInstance: Octokit, retryCount: number) => {
        octokitInstance.log.warn(`SecondaryRateLimit detected for request ${options.method} ${options.url} (retry ${retryCount}, waiting ${retryAfter}s)`)
        // Retry up to 3 times for secondary rate limit with longer wait
        if (retryCount < 3) return true
        return false
      }
    }
  })
}

export function handleGithubError(err: unknown): never {
  const status = isOctokitError(err) ? (err.status || err.response?.status) : undefined
  const message = err instanceof Error ? err.message : 'GitHub API error'
  const errorCode = isOctokitError(err) ? err.code : undefined
  const errorName = err instanceof Error ? err.name : undefined

  // Abort/timeout handling
  if (errorName === 'AbortError' || errorCode === 'ETIMEDOUT') {
    throw createError({ statusCode: 504, statusMessage: 'Request timeout contacting GitHub' })
  }

  // Common network errors
  if (errorCode && ['ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(errorCode)) {
    throw createError({ statusCode: 503, statusMessage: 'Network error contacting GitHub' })
  }

  // Bad credentials or unauthorized
  if (status === 401 || /bad credentials/i.test(message)) {
    throw createError({ statusCode: 401, statusMessage: 'Bad credentials' })
  }

  // Rate limit / abuse detection - convert 403 rate limit to 429
  if (status === 403 && (/rate limit/i.test(message) || /secondary rate/i.test(message))) {
    const headers = isOctokitError(err) ? (err.headers || err.response?.headers) : undefined
    const reset = headers?.['x-ratelimit-reset']
    let statusMessage = 'GitHub API rate limit exceeded.'
    if (reset) {
      const resetDate = new Date(parseInt(reset) * 1000)
      statusMessage += ` Resets at ${resetDate.toLocaleTimeString()}.`
    }
    throw createError({ statusCode: 429, statusMessage })
  }

  // For 5xx errors that exhausted retries, surface the error
  throw createError({
    statusCode: status || 502,
    statusMessage: `GitHub API temporarily unavailable: ${message}`
  })
}

export async function requireGithubAuth(event: H3Event) {
  const session = await getUserSession(event)
  if (!session?.user?.accessToken) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }
  return {
    user: session.user,
    accessToken: session.user.accessToken
  }
}
