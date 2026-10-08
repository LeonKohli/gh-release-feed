import type { H3Event } from 'h3'
import { useStorage } from 'nitropack/runtime/internal/storage'
import { createGithubClient, handleGithubError, requireGithubAuth } from '../../utils/github'
import { buildReleaseQuery } from '../../utils/github-release-query'

interface GraphQLResponse {
  viewer: {
    starredRepositories: {
      totalCount: number
      pageInfo: {
        endCursor: string | null
        hasNextPage: boolean
      }
      edges: Array<{ node: unknown }>
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

type CacheEntry = { data: GraphQLResponse; expiresAt: number }
const inflight = new Map<string, Promise<GraphQLResponse>>()

function respond(event: H3Event, data: GraphQLResponse, status: 'HIT' | 'MISS' | 'COALESCE') {
  const result = status === 'MISS' ? data : { ...data, rateLimit: { ...data.rateLimit, cost: 0 } }
  setResponseHeader(event, 'X-Cache-Status', status)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  setResponseHeader(event, 'X-GH-RateLimit-Remaining', String(result.rateLimit.remaining))
  setResponseHeader(event, 'X-GH-RateLimit-Cost', String(result.rateLimit.cost))
  setResponseHeader(event, 'X-GH-RateLimit-ResetAt', result.rateLimit.resetAt)
  return result
}

export default defineEventHandler(async (event) => {
  const { user, accessToken } = await requireGithubAuth(event)
  const query = getQuery(event)
  const cursor = typeof query.cursor === 'string' ? query.cursor : null
  const requestedPageSize = Number(query.pageSize ?? 60)
  if (!Number.isFinite(requestedPageSize) || !Number.isInteger(requestedPageSize)) {
    throw createError({ statusCode: 400, statusMessage: 'pageSize must be an integer' })
  }
  const pageSize = Math.min(Math.max(1, requestedPageSize), 100)
  const withDetails = query.withDetails === 'true'
  const forceRefresh = query.refresh === 'true'
  const configuredReleasesCount = Number(process.env.GITHUB_RELEASES_PER_REPO ?? '9')
  const releasesCount = Number.isFinite(configuredReleasesCount)
    ? Math.min(Math.max(1, Math.trunc(configuredReleasesCount)), 10)
    : 9
  const configuredTtl = Number(process.env.GITHUB_CACHE_TTL ?? '300')
  const ttlSeconds =
    Number.isFinite(configuredTtl) && configuredTtl > 0 ? Math.ceil(configuredTtl) : 300
  const cursorKey = cursor ? encodeURIComponent(cursor) : 'root'
  const variant = `v4-${withDetails ? 'full' : 'light'}-${releasesCount}`
  const cacheKey = `gh:releases:${user.id}:${cursorKey}:${pageSize}:${variant}`
  const storage = useStorage('cache')
  const cached = forceRefresh ? null : await storage.getItem<CacheEntry>(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return respond(event, cached.data, 'HIT')
  }

  const existing = inflight.get(cacheKey)
  if (existing) {
    try {
      return respond(event, await existing, 'COALESCE')
    } catch (error) {
      return handleGithubError(error)
    }
  }

  const octokit = createGithubClient(accessToken, { retries: 2, timeout: 45_000 })
  const promise = (async () => {
    const data = await octokit.graphql<GraphQLResponse>(
      buildReleaseQuery({ includeDescriptionHTML: withDetails, releasesCount }),
      { cursor, pageSize },
    )
    await storage.setItem(
      cacheKey,
      { data, expiresAt: Date.now() + ttlSeconds * 1000 },
      { ttl: ttlSeconds },
    )
    return data
  })()
  inflight.set(cacheKey, promise)
  try {
    return respond(event, await promise, 'MISS')
  } catch (error) {
    return handleGithubError(error)
  } finally {
    inflight.delete(cacheKey)
  }
})
