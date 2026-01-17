import { Octokit } from '@octokit/core'
import { throttling } from '@octokit/plugin-throttling'
import { retry } from '@octokit/plugin-retry'
import { useStorage } from 'nitropack/runtime/internal/storage'

interface GraphQLNodesResponse {
  nodes: Array<null | { __typename?: string; id?: string; descriptionHTML?: string }>
  rateLimit: {
    cost: number
    limit: number
    remaining: number
    resetAt: string
    used: number
  }
}

type DetailsCacheEntry = { id: string; descriptionHTML: string; expiresAt: number }

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user?.accessToken) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }
  const user = session.user!
  const accessToken = session.user.accessToken!

  const body = await readBody<{ ids?: string[] }>(event)
  const ids = Array.isArray(body?.ids) ? body!.ids.filter((v) => typeof v === 'string') : []
  if (ids.length === 0) {
    return { items: [], rateLimit: null }
  }
  if (ids.length > 50) {
    throw createError({ statusCode: 400, statusMessage: 'Too many IDs. Max 50 per request.' })
  }

  const storage = useStorage('cache')
  const ttlSeconds = Number(process.env.GITHUB_DETAILS_TTL ?? '600')

  const cacheKeys = ids.map((id) => `gh:release-details:${user.id}:${encodeURIComponent(id)}`)
  const cachedEntries = await Promise.all(cacheKeys.map((k) => storage.getItem<DetailsCacheEntry>(k)))

  const items: Array<{ id: string; descriptionHTML: string }> = []
  const missingIds: string[] = []
  const now = Date.now()
  for (let idx = 0; idx < cachedEntries.length; idx++) {
    const entry = cachedEntries[idx]
    if (entry && entry.expiresAt > now && entry.descriptionHTML) {
      items.push({ id: entry.id, descriptionHTML: entry.descriptionHTML })
    } else {
      const targetId = ids[idx]
      if (targetId) {
        missingIds.push(targetId)
      }
    }
  }
  const cacheHits = items.length
  const cacheMisses = missingIds.length

  let rateLimit: GraphQLNodesResponse['rateLimit'] | null = null

  if (missingIds.length > 0) {
    const OctokitWithPlugins = Octokit.plugin(throttling, retry)
    const octokit = new OctokitWithPlugins({
      auth: accessToken,
      userAgent: 'gh-release-feed',
      request: {
        timeout: 45_000,
        retries: 3,
        retryAfter: 5
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

    const QUERY = `
      query($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Release { id descriptionHTML }
        }
        rateLimit { cost limit remaining resetAt used }
      }
    `

    // The retry plugin handles 5xx errors automatically
    try {
      console.info(`[gh][details] cache MISS → fetching u=${user.id} ids=${missingIds.length}`)
      const data = await octokit.graphql<GraphQLNodesResponse>(QUERY, {
        ids: missingIds,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' }
      })

      rateLimit = data.rateLimit
      const fetched = (data.nodes || [])
        .filter((n): n is { id: string; descriptionHTML?: string } => !!n && typeof n.id === 'string')
        .map((n) => ({ id: n.id, descriptionHTML: n.descriptionHTML || '' }))

      // Store individually for better reuse
      await Promise.all(
        fetched.map((it) => storage.setItem(
          `gh:release-details:${user.id}:${encodeURIComponent(it.id)}`,
          { id: it.id, descriptionHTML: it.descriptionHTML, expiresAt: Date.now() + ttlSeconds * 1000 },
          { ttl: ttlSeconds }
        ))
      )

      items.push(...fetched)
    } catch (err: any) {
      const status = err?.status || err?.response?.status
      const message = err?.message || 'GitHub API error'
      // For 5xx errors that exhausted retries, surface the error
      throw createError({
        statusCode: status || 502,
        statusMessage: `GitHub API temporarily unavailable: ${message}`
      })
    }
  }

  const fetchedCount = items.length - cacheHits
  setResponseHeader(event, 'Cache-Control', `private, max-age=${ttlSeconds}, stale-while-revalidate=60`)
  setResponseHeader(event, 'X-Cache-Details', `hits=${cacheHits};misses=${cacheMisses};fetched=${fetchedCount}`)
  if (rateLimit) {
    setResponseHeader(event, 'X-GH-RateLimit-Remaining', String(rateLimit.remaining))
    setResponseHeader(event, 'X-GH-RateLimit-Cost', String(rateLimit.cost))
    setResponseHeader(event, 'X-GH-RateLimit-ResetAt', String(rateLimit.resetAt))
    console.info(`[gh][details] hits=${cacheHits} misses=${cacheMisses} fetched=${fetchedCount} rateLimit cost=${rateLimit.cost} remaining=${rateLimit.remaining} resetAt=${rateLimit.resetAt}`)
  } else {
    console.info(`[gh][details] hits=${cacheHits} misses=${cacheMisses} fetched=${fetchedCount}`)
  }
  return { items, rateLimit }
})
