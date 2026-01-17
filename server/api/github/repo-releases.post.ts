// All server utils are auto-imported by Nitro

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
  const { user, accessToken } = await requireGithubAuth(event)

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

  const octokit = createGithubClient(accessToken)

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

  // The retry plugin handles 5xx errors automatically
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
  } catch (err: unknown) {
    handleGithubError(err)
  }
})
