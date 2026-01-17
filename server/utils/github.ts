import { Octokit } from '@octokit/core'
import { throttling } from '@octokit/plugin-throttling'
import { retry } from '@octokit/plugin-retry'
import { H3Event } from 'h3'

const OctokitWithPlugins = Octokit.plugin(throttling, retry)

interface OctokitOptions {
  retries?: number
  retryAfter?: number
  timeout?: number
}

const defaultOptions: Required<OctokitOptions> = {
  retries: 3,
  retryAfter: 5,
  timeout: 45_000
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
      onRateLimit: (retryAfter: number, options: any, octokitInstance: any) => {
        octokitInstance.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`)
        if (options.request?.retryCount === 0) return true
      },
      onSecondaryRateLimit: (retryAfter: number, options: any, octokitInstance: any) => {
        octokitInstance.log.warn(`SecondaryRateLimit detected for request ${options.method} ${options.url}`)
        if (options.request?.retryCount === 0) return true
      }
    }
  })
}

export function handleGithubError(err: unknown): never {
  const error = err as any
  const status = error?.status || error?.response?.status
  const message = error?.message || 'GitHub API error'

  // Abort/timeout handling
  if (error?.name === 'AbortError' || error?.code === 'ETIMEDOUT') {
    throw createError({ statusCode: 504, statusMessage: 'Request timeout contacting GitHub' })
  }

  // Common network errors
  if (['ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(error?.code)) {
    throw createError({ statusCode: 503, statusMessage: 'Network error contacting GitHub' })
  }

  // Bad credentials or unauthorized
  if (status === 401 || /bad credentials/i.test(message)) {
    throw createError({ statusCode: 401, statusMessage: 'Bad credentials' })
  }

  // Rate limit / abuse detection - convert 403 rate limit to 429
  if (status === 403 && (/rate limit/i.test(message) || /secondary rate/i.test(message))) {
    const reset = error?.headers?.['x-ratelimit-reset'] || error?.response?.headers?.['x-ratelimit-reset']
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
