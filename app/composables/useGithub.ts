import { defineStore } from 'pinia'
import { openDB, type IDBPDatabase } from 'idb'
import { computed, onScopeDispose, ref, toRaw, watch } from 'vue'

interface RepositoryNode {
  id: string
  name: string
  url: string
  description: string | null
  forkCount?: number
  visibility?: 'PUBLIC' | 'PRIVATE' | 'INTERNAL'
  isArchived?: boolean
  pushedAt?: string | null
  homepageUrl?: string | null
  languages?: {
    totalCount: number
    edges: Array<{
      node: {
        id: string
        name: string
      }
    }>
  }
  licenseInfo: {
    spdxId: string
  } | null
  primaryLanguage: {
    id: string
    name: string
    color?: string | null
  } | null
  owner: {
    login: string
    avatarUrl: string
    url: string
  }
  stargazerCount: number
  latestRelease?: RepositoryNode['releases']['edges'][number]['node'] | null
  releases: {
    totalCount: number
    pageInfo: {
      hasNextPage: boolean
      endCursor: string | null
    }
    edges: Array<{
      node: {
        id: string
        isDraft: boolean
        isPrerelease: boolean
        name: string
        tagName: string
        publishedAt: string
        updatedAt: string
        url: string
        descriptionHTML?: string | null
      }
    }>
  }
}

interface GraphQLResponse {
  viewer: {
    starredRepositories: {
      totalCount: number
      pageInfo: {
        endCursor: string | null
        hasNextPage: boolean
      }
      edges: Array<{
        node: RepositoryNode
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

export interface ReleaseObj {
  id: string
  name: string
  tagName: string
  url: string
  publishedAt: string
  updatedAt?: string
  descriptionLoaded?: boolean
  descriptionHTML: string
  isPrerelease: boolean
  isDraft: boolean
  repo: {
    id: string
    name: string
    url: string
    stargazerCount: number
    description?: string
    forkCount?: number
    visibility?: 'PUBLIC' | 'PRIVATE' | 'INTERNAL'
    isArchived?: boolean
    pushedAt?: string | null
    homepageUrl?: string | null
    owner: {
      login: string
      url: string
      avatarUrl: string
    }
    licenseInfo: {
      spdxId: string
    } | null
    primaryLanguage: {
      id: string
      name: string
      color?: string | null
    } | null
    languages: {
      edges: Array<{
        node: {
          id: string
          name: string
        }
      }>
    }
  }
}

interface GithubReleasesDBSchema {
  descriptions: { key: string; value: string }
  releases: { key: string; value: ReleaseObj & { cachedAt: number } }
  metadata: { key: string; value: { lastFetchTimestamp: number } }
}

const STALE_THRESHOLD = 5 * 60 * 1000
const METADATA_KEY = 'github-releases-metadata-v2'
const descriptionKey = (release: ReleaseObj) =>
  `${release.id}-${release.updatedAt || release.publishedAt}`
const sortReleases = (releases: Iterable<ReleaseObj>) =>
  [...releases].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
const errorMessage = (error: unknown) => {
  if (
    error &&
    typeof error === 'object' &&
    'data' in error &&
    error.data &&
    typeof error.data === 'object' &&
    'message' in error.data &&
    typeof error.data.message === 'string'
  )
    return error.data.message

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return 'Could not contact GitHub. Try again.'
}

function quotaRetryAt(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('data' in error)) return null
  const response = error.data
  if (
    !response ||
    typeof response !== 'object' ||
    !('statusCode' in response) ||
    response.statusCode !== 429
  )
    return null
  const data = 'data' in response ? response.data : null
  if (!data || typeof data !== 'object') return Date.now() + 60_000
  const resetAt = 'resetAt' in data && typeof data.resetAt === 'number' ? data.resetAt : 0
  const retryAfter =
    'retryAfter' in data && typeof data.retryAfter === 'number' ? data.retryAfter * 1000 : 0
  return Math.max(resetAt, Date.now() + (retryAfter > 0 ? retryAfter : 60_000))
}

export const useGithubStore = defineStore('github', {
  state: () => ({
    releases: [] as ReleaseObj[],
    loading: false,
    backgroundLoading: false,
    error: null as string | null,
    lastFetchTimestamp: null as number | null,
    db: null as IDBPDatabase<GithubReleasesDBSchema> | null,
    accountId: null as string | null,
    reposProcessed: 0,
    reposTotal: 0,
    retries: 0,
    retryAt: null as number | null,
    rateLimitCost: 0,
    rateLimitRemaining: 5000,
    rateLimitResetAt: null as string | null,
  }),
  actions: {
    clearData() {
      this.releases = []
      this.loading = false
      this.backgroundLoading = false
      this.error = null
      this.lastFetchTimestamp = null
      this.reposProcessed = 0
      this.reposTotal = 0
      this.retries = 0
      this.retryAt = null
      this.rateLimitCost = 0
      this.rateLimitRemaining = 5000
      this.rateLimitResetAt = null
    },
    async initDB(accountId: string) {
      if (import.meta.server) return
      if (this.accountId !== accountId) await this.cleanup()
      this.accountId = accountId
      if (this.db) return
      try {
        const db = await openDB<GithubReleasesDBSchema>(`github-releases-v3-${accountId}`, 1, {
          upgrade(db) {
            db.createObjectStore('descriptions')
            db.createObjectStore('releases', { keyPath: 'id' })
            db.createObjectStore('metadata')
          },
        })
        if (this.accountId !== accountId) {
          db.close()
          return
        }
        this.db = db
        const metadata = await db.get('metadata', METADATA_KEY)
        if (this.db !== db) return
        this.lastFetchTimestamp = metadata?.lastFetchTimestamp ?? null
      } catch {
        // Private browsing or a full disk must not prevent an in-memory feed.
        if (this.accountId === accountId) this.db = null
      }
    },
    async loadCachedReleases() {
      if (!this.db) return
      try {
        const db = this.db
        const cached = sortReleases(
          await Promise.all(
            (await db.getAll('releases')).map(async ({ cachedAt: _cachedAt, ...release }) => ({
              ...toRaw(release),
              descriptionHTML:
                release.descriptionHTML ||
                (await db.get('descriptions', descriptionKey(release))) ||
                '',
            })),
          ),
        )
        if (this.db === db) this.releases = cached
      } catch {
        // The network can still supply a feed when local storage is unavailable.
      }
    },
    async persistFeed() {
      const fetchedAt = Date.now()
      const accountId = this.accountId
      if (this.db) {
        try {
          const tx = this.db.transaction(['releases', 'descriptions', 'metadata'], 'readwrite')
          await tx.objectStore('releases').clear()
          await tx.objectStore('descriptions').clear()
          for (const release of this.releases) {
            await tx
              .objectStore('releases')
              .put({ ...toRaw(release), descriptionHTML: '', cachedAt: fetchedAt })
            if (release.descriptionLoaded) {
              await tx
                .objectStore('descriptions')
                .put(release.descriptionHTML, descriptionKey(release))
            }
          }
          await tx.objectStore('metadata').put({ lastFetchTimestamp: fetchedAt }, METADATA_KEY)
          await tx.done
        } catch {
          return
        }
      }
      if (this.accountId === accountId) this.lastFetchTimestamp = fetchedAt
    },
    updateRateLimit(rateLimit: { cost: number; remaining: number; resetAt: string } | null) {
      if (!rateLimit) return
      this.rateLimitCost += rateLimit.cost
      this.rateLimitRemaining = rateLimit.remaining
      this.rateLimitResetAt = rateLimit.resetAt
      if (rateLimit.remaining <= 0)
        this.retryAt = Date.parse(rateLimit.resetAt) || Date.now() + 60_000
    },
    async clearCache() {
      if (this.db) {
        await this.db.clear('releases')
        await this.db.clear('descriptions')
        await this.db.clear('metadata')
      }
      this.clearData()
    },
    async cleanup() {
      this.db?.close()
      this.db = null
      this.accountId = null
      this.clearData()
    },
  },
})

export const useGithub = () => {
  const store = useGithubStore()
  const { loggedIn, session } = useUserSession()
  const descriptionErrors = ref<Record<string, string>>({})
  const pendingIds = new Set<string>()
  let detailsTask: Promise<void> | null = null
  let feedTask: Promise<void> | null = null
  let generation = 0
  let feedController: AbortController | null = null
  let detailsController: AbortController | null = null

  const ensureDescriptions = (ids: string[]): Promise<void> => {
    if (import.meta.server || !loggedIn.value) return Promise.resolve()
    if (store.retryAt && store.retryAt > Date.now()) {
      for (const id of ids) descriptionErrors.value[id] = 'GitHub API rate limit reached.'
      return Promise.resolve()
    }
    const releases = new Map(store.releases.map((release) => [release.id, release]))
    for (const id of ids) {
      const release = releases.get(id)
      if (release && !release.descriptionLoaded) pendingIds.add(id)
    }
    if (detailsTask) return detailsTask
    const currentGeneration = generation
    const controller = new AbortController()
    detailsController = controller
    detailsTask = Promise.resolve()
      .then(async () => {
        while (pendingIds.size && generation === currentGeneration) {
          if (store.retryAt && store.retryAt > Date.now()) {
            for (const id of pendingIds)
              descriptionErrors.value[id] = 'GitHub API rate limit reached.'
            pendingIds.clear()
            return
          }
          const byId = new Map(store.releases.map((release) => [release.id, release]))
          const batch = [...pendingIds].slice(0, 50)
          batch.forEach((id) => pendingIds.delete(id))
          const requested = batch.flatMap((id) => {
            const release = byId.get(id)
            return release && !release.descriptionLoaded ? [release] : []
          })
          if (!requested.length) continue
          const versions = new Map(
            requested.map((release) => [release.id, descriptionKey(release)]),
          )
          try {
            const result = await $fetch<{
              items: Array<{ id: string; descriptionHTML: string; updatedAt?: string }>
              rateLimit?: GraphQLResponse['rateLimit'] | null
            }>('/api/github/release-details', {
              method: 'POST',
              signal: controller.signal,
              body: {
                ids: requested.map((release) => release.id),
                versions: Object.fromEntries(
                  requested.map((release) => [
                    release.id,
                    release.updatedAt || release.publishedAt,
                  ]),
                ),
              },
              retry: false,
            })
            if (generation !== currentGeneration) return
            store.updateRateLimit(result.rateLimit ?? null)
            const currentReleases = new Map(store.releases.map((release) => [release.id, release]))
            const returnedIds = new Set<string>()
            for (const item of result.items) {
              if (generation !== currentGeneration) return
              const release = currentReleases.get(item.id)
              if (!release || descriptionKey(release) !== versions.get(item.id)) continue
              if (
                item.updatedAt &&
                Date.parse(item.updatedAt) < Date.parse(release.updatedAt || release.publishedAt)
              )
                continue
              returnedIds.add(item.id)
              if (item.updatedAt) release.updatedAt = item.updatedAt
              release.descriptionHTML = item.descriptionHTML
              release.descriptionLoaded = true
              delete descriptionErrors.value[item.id]
              if (store.db) {
                try {
                  const tx = store.db.transaction(['descriptions', 'releases'], 'readwrite')
                  await tx
                    .objectStore('descriptions')
                    .put(item.descriptionHTML, descriptionKey(release))
                  // Do not persist a partial refresh as a complete feed.
                  if (await tx.objectStore('releases').get(release.id)) {
                    await tx
                      .objectStore('releases')
                      .put({ ...toRaw(release), descriptionHTML: '', cachedAt: Date.now() })
                  }
                  await tx.done
                } catch {
                  /* Notes remain available in memory. */
                }
              }
            }
            if (generation !== currentGeneration) return
            for (const release of requested) {
              if (
                !returnedIds.has(release.id) &&
                descriptionKey(currentReleases.get(release.id) ?? release) ===
                  versions.get(release.id)
              )
                descriptionErrors.value[release.id] = 'Release notes unavailable.'
            }
          } catch (error) {
            if (generation !== currentGeneration) return
            store.retryAt = quotaRetryAt(error) ?? store.retryAt
            const currentReleases = new Map(store.releases.map((release) => [release.id, release]))
            for (const release of requested) {
              const current = currentReleases.get(release.id)
              if (current && descriptionKey(current) === versions.get(release.id))
                descriptionErrors.value[release.id] = errorMessage(error)
            }
          }
        }
      })
      .finally(() => {
        if (generation === currentGeneration) detailsTask = null
      })
    return detailsTask
  }

  const fetchReleases = (
    cursor: string | null = null,
    options: { force?: boolean } = {},
  ): Promise<void> => {
    if (feedTask) return feedTask
    if (store.retryAt && store.retryAt > Date.now()) return Promise.resolve()
    const currentGeneration = generation
    const controller = new AbortController()
    feedController = controller
    feedTask = (async () => {
      if (!loggedIn.value || !session.value?.user?.id) {
        store.error = 'Not authenticated'
        return
      }
      try {
        await store.initDB(session.value.user.id)
        if (generation !== currentGeneration) return
        if (!store.releases.length) await store.loadCachedReleases()
        if (generation !== currentGeneration) return
        if (
          !options.force &&
          !cursor &&
          store.lastFetchTimestamp &&
          Date.now() - store.lastFetchTimestamp < STALE_THRESHOLD
        )
          return
        store.error = null
        store.reposProcessed = 0
        store.loading = !store.releases.length
        store.backgroundLoading = !!store.releases.length
        descriptionErrors.value = {}
        const refreshed = new Map<string, ReleaseObj>()
        const existing = new Map(store.releases.map((release) => [release.id, release]))
        const startDate = new Date()
        startDate.setMonth(startDate.getMonth() - 3)
        const seenCursors = new Set<string>()
        let nextCursor = cursor
        do {
          if (store.retryAt && store.retryAt > Date.now())
            throw new Error('GitHub API rate limit reached. Please wait before retrying.')
          const response = await $fetch<GraphQLResponse>('/api/github/releases', {
            params: {
              cursor: nextCursor,
              pageSize: nextCursor ? 100 : 20,
              withDetails: false,
              refresh: options.force === true,
            },
            retry: false,
            signal: controller.signal,
          })
          if (generation !== currentGeneration) return
          const page = response.viewer?.starredRepositories
          if (!page || !Array.isArray(page.edges)) throw new Error('Invalid response from GitHub.')
          store.updateRateLimit(response.rateLimit)
          store.reposTotal = page.totalCount
          for (const { node: repo } of page.edges) {
            const nodes = repo.releases.edges.map((edge) => edge.node)
            if (repo.latestRelease && !nodes.some((node) => node.id === repo.latestRelease?.id))
              nodes.push(repo.latestRelease)
            for (const node of nodes) {
              if (!node.publishedAt || node.isDraft || new Date(node.publishedAt) < startDate)
                continue
              const previous = refreshed.get(node.id) ?? existing.get(node.id)
              const sameVersion =
                previous &&
                (previous.updatedAt || previous.publishedAt) ===
                  (node.updatedAt || node.publishedAt)
              const release: ReleaseObj = {
                id: node.id,
                name: node.name || node.tagName,
                tagName: node.tagName,
                url: node.url,
                publishedAt: node.publishedAt,
                updatedAt: node.updatedAt,
                isDraft: node.isDraft,
                isPrerelease: node.isPrerelease,
                descriptionHTML:
                  node.descriptionHTML || (sameVersion ? previous.descriptionHTML : '') || '',
                descriptionLoaded:
                  !!node.descriptionHTML || !!(sameVersion && previous.descriptionLoaded),
                repo: {
                  id: repo.id,
                  name: repo.name,
                  url: repo.url,
                  description: repo.description || '',
                  forkCount: repo.forkCount,
                  visibility: repo.visibility,
                  isArchived: repo.isArchived,
                  pushedAt: repo.pushedAt,
                  homepageUrl: repo.homepageUrl,
                  stargazerCount: repo.stargazerCount,
                  owner: repo.owner,
                  primaryLanguage: repo.primaryLanguage,
                  languages: repo.languages ?? { edges: [] },
                  licenseInfo: repo.licenseInfo,
                },
              }
              refreshed.set(node.id, release)
            }
          }
          store.reposProcessed += page.edges.length
          store.releases = sortReleases(new Map([...existing, ...refreshed]).values())
          store.loading = false
          nextCursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
          if (nextCursor && seenCursors.has(nextCursor))
            throw new Error('GitHub returned a repeated page cursor. Try again.')
          if (nextCursor) seenCursors.add(nextCursor)
          store.backgroundLoading = !!nextCursor
          if (nextCursor && response.rateLimit.remaining <= 0) {
            throw new Error(
              `GitHub API rate limit reached. Resets at ${new Date(response.rateLimit.resetAt).toLocaleTimeString()}.`,
            )
          }
        } while (nextCursor)
        // Remove unstarred/deleted releases only after every page succeeds.
        // Preserve notes that arrived while subsequent pages were being fetched.
        const displayed = new Map(store.releases.map((release) => [release.id, release]))
        store.releases = sortReleases(
          [...refreshed.keys()].flatMap((id) => {
            const release = displayed.get(id)
            return release ? [release] : []
          }),
        )
        await store.persistFeed()
      } catch (error) {
        if (generation === currentGeneration) {
          store.retryAt = quotaRetryAt(error) ?? store.retryAt
          store.error = errorMessage(error)
        }
      } finally {
        if (generation === currentGeneration) {
          store.loading = false
          store.backgroundLoading = false
        }
      }
    })().finally(() => {
      if (generation === currentGeneration) feedTask = null
    })
    return feedTask
  }

  const cancelRequests = () => {
    generation++
    feedController?.abort()
    detailsController?.abort()
    feedTask = null
    detailsTask = null
    pendingIds.clear()
  }
  const cleanup = async () => {
    cancelRequests()
    pendingIds.clear()
    descriptionErrors.value = {}
    await store.cleanup()
  }
  onScopeDispose(() => {
    void cleanup()
  })
  watch(
    () => (loggedIn.value ? session.value?.user?.id : undefined),
    async (id, previous) => {
      if (id !== previous) await cleanup()
    },
  )

  return {
    releases: computed(() => store.releases),
    loading: computed(() => store.loading),
    backgroundLoading: computed(() => store.backgroundLoading),
    error: computed(() => store.error),
    reposProcessed: computed(() => store.reposProcessed),
    reposTotal: computed(() => store.reposTotal),
    rateLimitRemaining: computed(() => store.rateLimitRemaining),
    rateLimitResetAt: computed(() => store.rateLimitResetAt),
    retryAt: computed(() => store.retryAt),
    retries: computed(() => store.retries),
    descriptionErrors,
    ensureDescriptions,
    fetchReleases,
    clearCache: async () => {
      cancelRequests()
      await store.clearCache()
    },
    cleanup,
  }
}
