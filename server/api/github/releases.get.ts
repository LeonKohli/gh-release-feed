import { Octokit } from '@octokit/core'

interface GraphQLResponse {
  viewer: {
    starredRepositories: {
      totalCount?: number
      pageInfo: {
        endCursor: string | null
        hasNextPage: boolean
      }
      edges: Array<{ node: any }>
    }
  }
  rateLimit: {
    cost: number
    limit: number
    remaining: number
    resetAt: string
    used: number
  }
}

const RELEASE_FIELDS = `
  fragment ReleaseFields on Release {
    id
    isDraft
    isPrerelease
    name
    tagName
    publishedAt
    updatedAt
    url
    descriptionHTML
  }
`

const REPOSITORY_FIELDS = `
  fragment RepositoryFields on Repository {
    name
    url
    description
    primaryLanguage {
      id
      name
    }
    owner {
      login
      avatarUrl
      url
    }
    stargazerCount
    languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
      totalCount
      edges {
        node {
          id
          name
        }
      }
    }
    licenseInfo {
      spdxId
    }
    releases(first: 10) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          ...ReleaseFields
        }
      }
    }
  }
`

const RECENT_RELEASES_QUERY = `
  ${RELEASE_FIELDS}
  ${REPOSITORY_FIELDS}
  query($cursor: String, $pageSize: Int!) {
    viewer {
      starredRepositories(
        first: $pageSize,
        after: $cursor,
        orderBy: {field: STARRED_AT, direction: DESC}
      ) {
        pageInfo {
          endCursor
          hasNextPage
        }
        edges {
          node {
            ...RepositoryFields
          }
        }
      }
    }
    rateLimit {
      cost
      limit
      remaining
      resetAt
      used
    }
  }
`

type CacheEntry = { data: GraphQLResponse; expiresAt: number }
const cache: Map<string, CacheEntry> = (globalThis as any).__ghProxyCache || new Map<string, CacheEntry>()
;(globalThis as any).__ghProxyCache = cache

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user?.accessToken) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const query = getQuery(event)
  const cursor = typeof query.cursor === 'string' ? query.cursor : null
  const requestedPageSize = Number(query.pageSize ?? 20)
  const pageSize = Math.min(Math.max(1, requestedPageSize), 100)

  const octokit = new Octokit({
    auth: session.user.accessToken,
    request: { timeout: 45_000 }
  })

  const cacheKey = `${session.user.id}:${cursor ?? ''}:${pageSize}`
  const now = Date.now()
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    setResponseHeader(event, 'Cache-Control', 'private, max-age=20')
    return cached.data
  }

  // Basic exponential backoff for transient errors
  const maxRetries = 3
  let delay = 800
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Optional API version header for stability
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 50_000)
      const data = await octokit.graphql<GraphQLResponse>(RECENT_RELEASES_QUERY, {
        cursor,
        pageSize,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
        request: { signal: controller.signal }
      })
      clearTimeout(timer)
      // Cache for a very short time to reduce bursts (private per user via cookies)
      setResponseHeader(event, 'Cache-Control', 'private, max-age=20')
      cache.set(cacheKey, { data, expiresAt: Date.now() + 20_000 })
      return data
    } catch (err: any) {
      const status = err?.status || err?.response?.status
      const message = err?.message || 'GitHub API error'

      // Abort/timeout handling
      if (err?.name === 'AbortError' || err?.code === 'ETIMEDOUT') {
        throw createError({ statusCode: 504, statusMessage: 'Request timeout contacting GitHub' })
      }

      // Common network errors
      if (['ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(err?.code)) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, delay))
          delay *= 2
          continue
        }
        throw createError({ statusCode: 503, statusMessage: 'Network error contacting GitHub' })
      }

      // Bad credentials or unauthorized
      if (status === 401 || /bad credentials/i.test(message)) {
        throw createError({ statusCode: 401, statusMessage: 'Bad credentials' })
      }

      // Rate limit / abuse detection
      if (status === 403 && (/rate limit/i.test(message) || /secondary rate/i.test(message))) {
        // Try to surface a friendlier 429 to the client
        const reset = err?.headers?.['x-ratelimit-reset'] || err?.response?.headers?.['x-ratelimit-reset']
        let statusMessage = 'GitHub API rate limit exceeded.'
        if (reset) {
          const resetDate = new Date(parseInt(reset) * 1000)
          statusMessage += ` Resets at ${resetDate.toLocaleTimeString()}.`
        }
        throw createError({ statusCode: 429, statusMessage })
      }
      if ((status === 429 || /rate limit/i.test(message)) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delay))
        delay *= 2
        continue
      }

      // Retry on transient upstream errors
      if ([500, 502, 503, 504].includes(status) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delay))
        delay *= 2
        continue
      }

      // Fallback: surface useful status & message
      throw createError({
        statusCode: status || 500,
        statusMessage: message
      })
    }
  }
})
