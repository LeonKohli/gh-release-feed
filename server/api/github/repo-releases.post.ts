import { Octokit } from '@octokit/core'
import { throttling } from '@octokit/plugin-throttling'
import { useStorage } from 'nitropack/runtime/internal/storage'

interface RepositoryReleasesResponse {
  repository: RepositoryNode | null
  rateLimit: {
    cost: number
    limit: number
    remaining: number
    resetAt: string
    used: number
  }
}

interface RepositoryNode {
  id: string
  name: string
  url: string
  description: string | null
  primaryLanguage: { id: string; name: string } | null
  owner: { login: string; avatarUrl: string; url: string }
  stargazerCount: number
  languages: {
    totalCount: number
    edges: Array<{ node: { id: string; name: string } }>
  }
  licenseInfo: { spdxId: string } | null
  releases: {
    totalCount: number
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
    edges: Array<{ node: ReleaseNode }>
  }
}

interface ReleaseNode {
  id: string
  isDraft: boolean
  isPrerelease: boolean
  name: string | null
  tagName: string
  publishedAt: string
  updatedAt: string
  url: string
  descriptionHTML?: string | null
}

type CacheEntry = { data: RepositoryReleasesResponse; expiresAt: number }

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user?.accessToken) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }
  const user = session.user!
  const accessToken = session.user.accessToken!

  const body = await readBody<{ repoId?: string; cursor?: string | null; limit?: number; withDetails?: boolean }>(event)
  const repoId = body?.repoId
  if (!repoId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing repoId' })
  }
  const cursor = typeof body?.cursor === 'string' ? body!.cursor : null
  const requestedLimit = Number(body?.limit ?? 3)
  const limit = Math.min(Math.max(1, requestedLimit), 10)
  const withDetails = Boolean(body?.withDetails)

  const storage = useStorage('cache')
  const ttlSeconds = Number(process.env.GITHUB_REPO_RELEASES_TTL ?? '180')
  const cursorKey = cursor ? encodeURIComponent(cursor) : 'root'
  const variant = `${withDetails ? 'full' : 'light'}-${limit}`
  const cacheKey = `gh:repo-releases:${user.id}:${encodeURIComponent(repoId)}:${cursorKey}:${variant}`
  const now = Date.now()
  const cached = await storage.getItem<CacheEntry>(cacheKey)
  if (cached && cached.expiresAt > now) {
    setResponseHeader(event, 'Cache-Control', `private, max-age=${ttlSeconds}, stale-while-revalidate=60`)
    setResponseHeader(event, 'X-Cache-Status', 'HIT')
    const rateLimit = cached.data?.rateLimit
    if (rateLimit) {
      setResponseHeader(event, 'X-GH-RateLimit-Remaining', String(rateLimit.remaining))
      setResponseHeader(event, 'X-GH-RateLimit-Cost', String(rateLimit.cost))
      setResponseHeader(event, 'X-GH-RateLimit-ResetAt', String(rateLimit.resetAt))
    }
    console.info(`[gh][repo] cache HIT u=${user.id} repo=${repoId} cursor=${cursor ?? ''} limit=${limit} details=${withDetails} ttl=${ttlSeconds}`)
    return cached.data
  }

  const ThrottledOctokit = Octokit.plugin(throttling)
  const octokit = new ThrottledOctokit({
    auth: accessToken,
    userAgent: 'gh-release-feed',
    request: { timeout: 45_000 },
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

  const releaseFields = `
    fragment ReleaseFields on Release {
      id
      isDraft
      isPrerelease
      name
      tagName
      publishedAt
      updatedAt
      url
      ${withDetails ? 'descriptionHTML' : ''}
    }
  `

  const query = `
    ${releaseFields}
    query($repoId: ID!, $first: Int!, $cursor: String) {
      node(id: $repoId) {
        ... on Repository {
          id
          name
          url
          description
          primaryLanguage { id name }
          owner { login avatarUrl url }
          stargazerCount
          languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
            totalCount
            edges { node { id name } }
          }
          licenseInfo { spdxId }
          releases(first: $first, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
            totalCount
            pageInfo { hasNextPage endCursor }
            edges { node { ...ReleaseFields } }
          }
        }
      }
      rateLimit { cost limit remaining resetAt used }
    }
  `

  const maxRetries = 3
  let delay = 200
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.info(`[gh][repo] cache MISS → fetching u=${user.id} repo=${repoId} cursor=${cursor ?? ''} limit=${limit} details=${withDetails}`)
      const data = await octokit.graphql<RepositoryReleasesResponse>(query, {
        repoId,
        first: limit,
        cursor,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' }
      })
      setResponseHeader(event, 'Cache-Control', `private, max-age=${ttlSeconds}, stale-while-revalidate=60`)
      setResponseHeader(event, 'X-Cache-Status', 'MISS')
      if (data?.rateLimit) {
        setResponseHeader(event, 'X-GH-RateLimit-Remaining', String(data.rateLimit.remaining))
        setResponseHeader(event, 'X-GH-RateLimit-Cost', String(data.rateLimit.cost))
        setResponseHeader(event, 'X-GH-RateLimit-ResetAt', String(data.rateLimit.resetAt))
        console.info(`[gh][repo] rateLimit cost=${data.rateLimit.cost} remaining=${data.rateLimit.remaining} resetAt=${data.rateLimit.resetAt}`)
      }
      await storage.setItem(cacheKey, { data, expiresAt: Date.now() + ttlSeconds * 1000 }, { ttl: ttlSeconds })
      return data
    } catch (err: any) {
      const status = err?.status || err?.response?.status
      const message = err?.message || 'GitHub API error'

      if (['ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(err?.code)) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, delay))
          delay *= 2
          continue
        }
        throw createError({ statusCode: 503, statusMessage: 'Network error contacting GitHub' })
      }

      if (status === 401 || /bad credentials/i.test(message)) {
        throw createError({ statusCode: 401, statusMessage: 'Bad credentials' })
      }

      if (status === 403 && (/rate limit/i.test(message) || /secondary rate/i.test(message))) {
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

      if ([500, 502, 503, 504].includes(status) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delay))
        delay *= 2
        continue
      }

      throw createError({ statusCode: status || 500, statusMessage: message })
    }
  }
})
