import { Octokit } from '@octokit/core'
import { throttling } from '@octokit/plugin-throttling'
import { retry } from '@octokit/plugin-retry'
import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'

const OctokitWithPlugins = Octokit.plugin(throttling, retry)

interface OctokitOptions {
  retries?: number
  timeout?: number
}

// Proper type for GitHub API errors
interface OctokitError extends Error {
  status?: number
  code?: string
  response?: {
    status?: number
    headers?: Record<string, string>
    data?: { errors?: Array<{ type?: string }> }
  }
  headers?: Record<string, string>
  errors?: Array<{ type?: string; message?: string }>
  data?: { errors?: Array<{ type?: string }> }
}

// Type guard for OctokitError
function isOctokitError(err: unknown): err is OctokitError {
  return err instanceof Error
}

const defaultOptions: Required<OctokitOptions> = {
  retries: 2,
  timeout: 60_000,
}

export function createGithubClient(accessToken: string, options: OctokitOptions = {}) {
  const opts = { ...defaultOptions, ...options }

  return new OctokitWithPlugins({
    auth: accessToken,
    userAgent: 'gh-release-feed',
    request: {
      timeout: opts.timeout,
      retries: opts.retries,
    },
    retry: {
      doNotRetry: [400, 401, 403, 404, 410, 422, 429, 451],
    },
    throttle: {
      // Share scheduling for one credential without coupling unrelated users.
      id: createHash('sha256').update(accessToken).digest('hex'),
      // Quota exhaustion should reach the UI instead of holding a request until reset.
      onRateLimit: () => false,
      onSecondaryRateLimit: () => false,
    },
  })
}

export function handleGithubError(err: unknown): never {
  const status = isOctokitError(err) ? err.status || err.response?.status : undefined
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

  const headers = isOctokitError(err) ? err.headers || err.response?.headers : undefined
  const graphqlRateLimit =
    isOctokitError(err) &&
    [err.errors, err.data?.errors, err.response?.data?.errors].some((errors) =>
      errors?.some((error) => error.type === 'RATE_LIMITED'),
    )
  if (
    status === 429 ||
    graphqlRateLimit ||
    ((status === 200 || status === 403) &&
      (/rate limit|secondary rate|abuse/i.test(message) ||
        headers?.['x-ratelimit-remaining'] === '0'))
  ) {
    const reset = Number(headers?.['x-ratelimit-reset'])
    const retryAfter = Number(headers?.['retry-after'])
    throw createError({
      statusCode: 429,
      statusMessage: 'GitHub API rate limit exceeded',
      message:
        Number.isFinite(reset) && reset > 0
          ? `GitHub API rate limit exceeded. Resets at ${new Date(reset * 1000).toLocaleTimeString()}.`
          : Number.isFinite(retryAfter) && retryAfter > 0
            ? `GitHub API rate limit exceeded. Try again in ${retryAfter} seconds.`
            : 'GitHub API rate limit exceeded. Please try again later.',
      data: {
        resetAt: Number.isFinite(reset) && reset > 0 ? reset * 1000 : null,
        retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
      },
    })
  }
  if (status === 403) {
    throw createError({ statusCode: 403, statusMessage: 'GitHub access denied' })
  }

  // For 5xx errors that exhausted retries, surface the error
  throw createError({
    statusCode: status && status >= 400 ? status : 502,
    statusMessage: `GitHub API temporarily unavailable: ${message}`,
  })
}

export async function requireGithubAuth(event: H3Event) {
  const session = await getUserSession(event)
  if (!session?.user?.accessToken) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }
  return {
    user: session.user,
    accessToken: session.user.accessToken,
  }
}
