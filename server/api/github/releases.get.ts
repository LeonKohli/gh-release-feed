// All server utils (useStorage, createGithubClient, handleGithubError, requireGithubAuth) are auto-imported by Nitro

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
type CacheEntry = { data: GraphQLResponse; expiresAt: number }

// In-flight coalescing map to dedupe concurrent identical fetches per user/cursor/page
const inflight: Map<string, Promise<GraphQLResponse>> = (globalThis as any).__ghReleasesInflight || new Map()
;(globalThis as any).__ghReleasesInflight = inflight

function buildQuery (opts: { includeDescriptionHTML: boolean, releasesCount: number }) {
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
      ${opts.includeDescriptionHTML ? 'descriptionHTML' : ''}
    }
  `

  const repositoryFields = `
    fragment RepositoryFields on Repository {
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
      releases(first: ${opts.releasesCount}) {
        totalCount
        pageInfo { hasNextPage endCursor }
        edges { node { ...ReleaseFields } }
      }
    }
  `

  return `
    ${releaseFields}
    ${repositoryFields}
    query($cursor: String, $pageSize: Int!) {
      viewer {
        starredRepositories(
          first: $pageSize,
          after: $cursor,
          orderBy: {field: STARRED_AT, direction: DESC}
        ) {
          pageInfo { endCursor hasNextPage }
          edges { node { ...RepositoryFields } }
        }
      }
      rateLimit { cost limit remaining resetAt used }
    }
  `
}

export default defineEventHandler(async (event) => {
  const { user, accessToken } = await requireGithubAuth(event)

  const query = getQuery(event)
  const rawCursor = typeof query.cursor === 'string' ? query.cursor : null
  const cursorKey = rawCursor ? encodeURIComponent(rawCursor) : 'root'
  const cursor = rawCursor
  const requestedPageSize = Number(query.pageSize ?? 60)
  const pageSize = Math.min(Math.max(1, requestedPageSize), 100)
  const withDetails = String(query.withDetails ?? 'false') === 'true'
  const releasesCount = Math.min(Math.max(1, Number(process.env.GITHUB_RELEASES_PER_REPO ?? '3')), 10)

  const octokit = createGithubClient(accessToken)

  const storage = useStorage('cache')
  const ttlSeconds = Number(process.env.GITHUB_CACHE_TTL ?? '300')
  const detailVariant = `${withDetails ? 'full' : 'light'}-${releasesCount}`
  const cacheKey = `gh:releases:${user.id}:${cursorKey}:${pageSize}:${detailVariant}`
  const now = Date.now()
  const cached = await storage.getItem<CacheEntry>(cacheKey)
  if (cached && cached.expiresAt > now) {
    setResponseHeader(event, 'X-Cache-Status', 'HIT')
    setResponseHeader(event, 'Cache-Control', `private, max-age=${ttlSeconds}, stale-while-revalidate=60`)
    if (cached.data?.rateLimit) {
      setResponseHeader(event, 'X-GH-RateLimit-Remaining', String(cached.data.rateLimit.remaining))
      setResponseHeader(event, 'X-GH-RateLimit-Cost', String(cached.data.rateLimit.cost))
      setResponseHeader(event, 'X-GH-RateLimit-ResetAt', String(cached.data.rateLimit.resetAt))
    }
    console.info(`[gh][releases] cache HIT u=${user.id} cursor=${cursor ?? ''} pageSize=${pageSize} details=${withDetails} ttl=${ttlSeconds}`)
    return cached.data
  }

  // Coalesce in-flight identical requests (BEFORE making a new request)
  const existing = inflight.get(cacheKey)
  if (existing) {
    setResponseHeader(event, 'X-Cache-Status', 'COALESCE')
    setResponseHeader(event, 'Cache-Control', `private, max-age=${ttlSeconds}, stale-while-revalidate=60`)
    console.info(`[gh][releases] inflight COALESCE u=${user.id} cursor=${cursor ?? ''} pageSize=${pageSize} details=${withDetails}`)
    try {
      const data = await existing
      if (data?.rateLimit) {
        setResponseHeader(event, 'X-GH-RateLimit-Remaining', String(data.rateLimit.remaining))
        setResponseHeader(event, 'X-GH-RateLimit-Cost', String(data.rateLimit.cost))
        setResponseHeader(event, 'X-GH-RateLimit-ResetAt', String(data.rateLimit.resetAt))
      }
      return data
    } catch (coalescedError: any) {
      // The coalesced request failed - let this request try fresh
      console.warn(`[gh][releases] coalesced request failed, trying fresh: ${coalescedError?.message}`)
    }
  }

  // Create a single promise that includes all retries (handled by retry plugin)
  // The inflight entry persists until the entire operation succeeds or fails
  const queryStr = buildQuery({ includeDescriptionHTML: withDetails, releasesCount })
  console.info(`[gh][releases] cache MISS → fetching u=${user.id} cursor=${cursor ?? ''} pageSize=${pageSize} details=${withDetails}`)

  const fetchPromise = (async (): Promise<GraphQLResponse> => {
    try {
      const data = await octokit.graphql<GraphQLResponse>(queryStr, {
        cursor,
        pageSize,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' }
      })
      await storage.setItem(cacheKey, { data, expiresAt: Date.now() + ttlSeconds * 1000 }, { ttl: ttlSeconds })
      return data
    } catch (err: unknown) {
      handleGithubError(err)
    }
  })()

  // Register inflight BEFORE awaiting, delete AFTER completion
  inflight.set(cacheKey, fetchPromise)

  try {
    const data = await fetchPromise
    setResponseHeader(event, 'X-Cache-Status', 'MISS')
    setResponseHeader(event, 'Cache-Control', `private, max-age=${ttlSeconds}, stale-while-revalidate=60`)
    if (data?.rateLimit) {
      setResponseHeader(event, 'X-GH-RateLimit-Remaining', String(data.rateLimit.remaining))
      setResponseHeader(event, 'X-GH-RateLimit-Cost', String(data.rateLimit.cost))
      setResponseHeader(event, 'X-GH-RateLimit-ResetAt', String(data.rateLimit.resetAt))
      console.info(`[gh][releases] rateLimit cost=${data.rateLimit.cost} remaining=${data.rateLimit.remaining} resetAt=${data.rateLimit.resetAt}`)
    }
    return data
  } finally {
    // Only delete from inflight after the ENTIRE operation is complete (including all retries)
    inflight.delete(cacheKey)
  }
})
