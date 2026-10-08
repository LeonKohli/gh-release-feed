import { useStorage } from 'nitropack/runtime/internal/storage'
import { createGithubClient, handleGithubError, requireGithubAuth } from '../../utils/github'

interface GraphQLNodesResponse {
  nodes: Array<null | { id?: string; descriptionHTML?: string; updatedAt?: string }>
  rateLimit: {
    cost: number
    limit: number
    remaining: number
    resetAt: string
    used: number
  }
}

type DescriptionItem = { id: string; descriptionHTML: string; updatedAt?: string }
type DetailsCacheEntry = DescriptionItem & { expiresAt: number }

export default defineEventHandler(async (event) => {
  const { user, accessToken } = await requireGithubAuth(event)
  const body = await readBody<{ ids?: unknown; versions?: unknown }>(event)
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : []
  if (ids.length === 0) return { items: [], rateLimit: null }
  if (ids.length > 50) {
    throw createError({ statusCode: 400, statusMessage: 'Too many IDs. Max 50 per request.' })
  }
  const versions = new Map<string, string>()
  if (body.versions !== undefined) {
    if (!body.versions || typeof body.versions !== 'object' || Array.isArray(body.versions)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'versions must contain release timestamps',
      })
    }
    const entries = Object.entries(body.versions)
    if (entries.length > 50) {
      throw createError({ statusCode: 400, statusMessage: 'Too many release versions. Max 50.' })
    }
    for (const [id, version] of entries) {
      if (
        !ids.includes(id) ||
        typeof version !== 'string' ||
        version.length > 64 ||
        !Number.isFinite(Date.parse(version))
      ) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid release version' })
      }
      versions.set(id, version)
    }
  }

  const storage = useStorage('cache')
  const configuredTtl = Number(process.env.GITHUB_DETAILS_TTL ?? '600')
  const ttlSeconds =
    Number.isFinite(configuredTtl) && configuredTtl > 0 ? Math.ceil(configuredTtl) : 600
  const cacheKey = (id: string) => {
    const version = versions.get(id)
    return `gh:release-details:${user.id}:${encodeURIComponent(id)}${version ? `:${encodeURIComponent(version)}` : ''}`
  }
  const cachedEntries = await Promise.all(
    ids.map((id) => storage.getItem<DetailsCacheEntry>(cacheKey(id))),
  )
  const items: DescriptionItem[] = []
  const missingIds: string[] = []
  const now = Date.now()
  for (const [index, id] of ids.entries()) {
    const entry = cachedEntries[index]
    if (entry && entry.expiresAt > now) {
      items.push({
        id: entry.id,
        descriptionHTML: entry.descriptionHTML,
        ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
      })
    } else {
      missingIds.push(id)
    }
  }
  const cacheHits = items.length
  let rateLimit: GraphQLNodesResponse['rateLimit'] | null = null

  if (missingIds.length > 0) {
    const octokit = createGithubClient(accessToken, { retries: 2, timeout: 45_000 })
    try {
      const data = await octokit.graphql<GraphQLNodesResponse>(
        `query($ids: [ID!]!) {
          nodes(ids: $ids) { ... on Release { id descriptionHTML updatedAt } }
          rateLimit { cost limit remaining resetAt used }
        }`,
        { ids: missingIds },
      )
      rateLimit = data.rateLimit
      const fetched = data.nodes.flatMap((node) =>
        node && typeof node.id === 'string'
          ? [
              {
                id: node.id,
                descriptionHTML: node.descriptionHTML ?? '',
                ...(node.updatedAt ? { updatedAt: node.updatedAt } : {}),
              },
            ]
          : [],
      )
      await Promise.all(
        fetched.map(async (item) => {
          const requestedVersion = versions.get(item.id)
          if (requestedVersion && item.updatedAt && requestedVersion !== item.updatedAt) return
          return storage.setItem(
            cacheKey(item.id),
            { ...item, expiresAt: Date.now() + ttlSeconds * 1000 },
            { ttl: ttlSeconds },
          )
        }),
      )
      items.push(...fetched)
    } catch (error) {
      return handleGithubError(error)
    }
  }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  setResponseHeader(
    event,
    'X-Cache-Details',
    `hits=${cacheHits};misses=${missingIds.length};fetched=${items.length - cacheHits}`,
  )
  if (rateLimit) {
    setResponseHeader(event, 'X-GH-RateLimit-Remaining', String(rateLimit.remaining))
    setResponseHeader(event, 'X-GH-RateLimit-Cost', String(rateLimit.cost))
    setResponseHeader(event, 'X-GH-RateLimit-ResetAt', rateLimit.resetAt)
  } else {
    setResponseHeader(event, 'X-GH-RateLimit-Cost', '0')
  }
  return { items, rateLimit }
})
