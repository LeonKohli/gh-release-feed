// Minimal endpoint to get starred repos list
// Only fetches owner/name - much lighter than full releases query

interface StarredRepo {
  id: string
  name: string
  owner: string
  url: string
  stargazerCount: number
  primaryLanguage: { id: string; name: string } | null
  languages: Array<{ id: string; name: string }>
  licenseInfo: { spdxId: string } | null
  avatarUrl: string
}

interface GraphQLResponse {
  viewer: {
    starredRepositories: {
      totalCount: number
      pageInfo: {
        hasNextPage: boolean
        endCursor: string | null
      }
      edges: Array<{
        starredAt: string
        node: {
          id: string
          name: string
          url: string
          stargazerCount: number
          primaryLanguage: { id: string; name: string } | null
          languages: {
            edges: Array<{ node: { id: string; name: string } }>
          }
          licenseInfo: { spdxId: string } | null
          owner: {
            login: string
            avatarUrl: string
          }
        }
      }>
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

const QUERY = `
  query($cursor: String, $pageSize: Int!) {
    viewer {
      starredRepositories(
        first: $pageSize,
        after: $cursor,
        orderBy: {field: STARRED_AT, direction: DESC}
      ) {
        totalCount
        pageInfo { endCursor hasNextPage }
        edges {
          starredAt
          node {
            id
            name
            url
            stargazerCount
            primaryLanguage { id name }
            languages(first: 5) { edges { node { id name } } }
            licenseInfo { spdxId }
            owner { login avatarUrl }
          }
        }
      }
    }
    rateLimit { cost limit remaining resetAt used }
  }
`

export default defineEventHandler(async (event) => {
  const { user, accessToken } = await requireGithubAuth(event)

  const query = getQuery(event)
  const cursor = typeof query.cursor === 'string' ? query.cursor : null
  const requestedPageSize = Number(query.pageSize ?? 100)
  const pageSize = Math.min(Math.max(1, requestedPageSize), 100)

  const storage = useStorage('cache')
  const ttlSeconds = 300 // 5 minute cache
  const cacheVersion = 'v2' // Increment when query changes

  const cursorKey = cursor ? encodeURIComponent(cursor) : 'root'
  const cacheKey = `gh:starred:${cacheVersion}:${user.id}:${cursorKey}:${pageSize}`

  // Check cache
  const cached = await storage.getItem<{ data: unknown; expiresAt: number }>(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    setResponseHeader(event, 'X-Cache-Status', 'HIT')
    return cached.data
  }

  const octokit = createGithubClient(accessToken)

  try {
    console.info(`[gh][starred] Fetching starred repos for user=${user.id} cursor=${cursor ?? 'root'}`)

    const data = await octokit.graphql<GraphQLResponse>(QUERY, {
      cursor,
      pageSize,
      headers: { 'X-GitHub-Api-Version': '2022-11-28' }
    })

    const repos: StarredRepo[] = data.viewer.starredRepositories.edges.map(edge => ({
      id: edge.node.id,
      name: edge.node.name,
      owner: edge.node.owner.login,
      url: edge.node.url,
      stargazerCount: edge.node.stargazerCount,
      primaryLanguage: edge.node.primaryLanguage,
      languages: edge.node.languages.edges.map(e => e.node),
      licenseInfo: edge.node.licenseInfo,
      avatarUrl: edge.node.owner.avatarUrl
    }))

    const result = {
      repos,
      totalCount: data.viewer.starredRepositories.totalCount,
      pageInfo: data.viewer.starredRepositories.pageInfo,
      rateLimit: data.rateLimit
    }

    // Cache the result
    await storage.setItem(cacheKey, { data: result, expiresAt: Date.now() + ttlSeconds * 1000 }, { ttl: ttlSeconds })

    setResponseHeader(event, 'X-Cache-Status', 'MISS')
    setResponseHeader(event, 'X-GH-RateLimit-Remaining', String(data.rateLimit.remaining))

    console.info(`[gh][starred] Fetched ${repos.length} repos, total=${data.viewer.starredRepositories.totalCount}, hasMore=${data.viewer.starredRepositories.pageInfo.hasNextPage}`)

    return result
  } catch (err) {
    handleGithubError(err)
  }
})
