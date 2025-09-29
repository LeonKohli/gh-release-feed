// composables/useGithub.ts
import { defineStore } from 'pinia'
import { openDB, type IDBPDatabase } from 'idb'


const BATCH_SIZES = {
    API_FETCH: 100,     // Number of repositories to fetch per API call
    PROCESSING: 10,     // Number of repositories to process in parallel
    RELEASE_FETCH: 10   // Number of releases to fetch per repository
} as const

interface RepositoryNode {
    id: string
    name: string
    url: string
    description: string | null
    languages: {
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
    } | null
    owner: {
        login: string
        avatarUrl: string
        url: string
    }
    stargazerCount: number
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
                descriptionHTML: string | null
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

interface RepoReleasesResponse {
    repository: RepositoryNode | null
    rateLimit: {
        cost: number
        limit: number
        remaining: number
        resetAt: string
        used: number
    }
}

interface GithubReleasesDBSchema {
    descriptions: {
        key: string
        value: string
    }
    releases: {
        key: string
        value: ReleaseObj & {
            cachedAt: number
        }
    }
    metadata: {
        key: string
        value: {
            lastFetchTimestamp: number
            etag?: string
        }
    }
}

const STALE_THRESHOLD = 5 * 60 * 1000 // 5 minutes in ms
const METADATA_KEY = 'github-releases-metadata'
const MAX_RETRIES = 3
const ADDITIONAL_RELEASE_BATCH_SIZE = 3
const MAX_ADDITIONAL_BATCHES_PER_REPO = 2

// Helper types for release processing
interface ReleaseProcessingOptions {
    startDate: Date
    db: IDBPDatabase<GithubReleasesDBSchema> | null
    existingReleases: Map<string, ReleaseObj>
}

interface ProcessedResult {
    release: ReleaseObj
    isNew: boolean
}

// Shared helper functions
const releaseProcessingHelpers = {
    async processReleaseNode(
        release: RepositoryNode['releases']['edges'][0]['node'],
        repo: RepositoryNode,
        options: ReleaseProcessingOptions
    ): Promise<ProcessedResult | null> {
        const { startDate, db, existingReleases } = options
        
        if (!release?.publishedAt) return null
        
        const releaseDate = new Date(release.publishedAt)
        const existingRelease = existingReleases.get(release.id)
        
        // Skip if too old or already exists and not updated
        if (releaseDate < startDate || (
            existingRelease && 
            new Date(existingRelease.publishedAt).getTime() === releaseDate.getTime()
        )) {
            return null
        }

        const releaseObj = {
            id: release.id,
            name: release.name || release.tagName,
            tagName: release.tagName,
            publishedAt: release.publishedAt,
            url: release.url,
            isDraft: release.isDraft,
            isPrerelease: release.isPrerelease,
            descriptionHTML: release.descriptionHTML || '',
            repo: {
                id: repo.id,
                name: repo.name,
                url: repo.url,
                description: repo.description || '',
                stargazerCount: repo.stargazerCount,
                owner: repo.owner,
                primaryLanguage: repo.primaryLanguage,
                languages: repo.languages,
                licenseInfo: repo.licenseInfo
            }
        }

        if (db) {
            const descriptionKey = `${release.id}-${release.publishedAt}`
            
            // Handle description caching
            if (releaseObj.descriptionHTML) {
                await db.put('descriptions', releaseObj.descriptionHTML, descriptionKey)
            } else {
                const cachedDescription = await db.get('descriptions', descriptionKey)
                if (cachedDescription) {
                    releaseObj.descriptionHTML = cachedDescription
                }
            }

            // Cache the full release
            await db.put('releases', {
                ...releaseObj,
                cachedAt: Date.now()
            })
        }

        return {
            release: releaseObj,
            isNew: !existingRelease
        }
    },

    sortReleases(releases: ReleaseObj[]): ReleaseObj[] {
        return [...releases].sort((a, b) => 
            new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        )
    },

    async processResponseBatch(
        batch: Array<{ node: RepositoryNode }>,
        options: {
            startDate: Date,
            db: IDBPDatabase<GithubReleasesDBSchema> | null,
            existingReleases: Map<string, ReleaseObj>,
            processedNodes: WeakMap<RepositoryNode, boolean>
        }
    ): Promise<{ newReleases: ReleaseObj[], newCount: number }> {
        const { startDate, db, existingReleases, processedNodes } = options
        
        const batchResults = await Promise.all(
            batch
                .filter(({ node }) => !processedNodes.has(node))
                .map(async ({ node: repo }) => {
                    if (!repo.releases?.edges) return []
                    
                    processedNodes.set(repo, true)
                    
                    const processedReleases = await Promise.all(
                        repo.releases.edges.map(async edge => 
                            await releaseProcessingHelpers.processReleaseNode(
                                edge.node,
                                repo,
                                { startDate, db, existingReleases }
                            )
                        )
                    )

                    const validResults = processedReleases.filter((r): r is NonNullable<typeof r> => r !== null)
                    return validResults
                })
        )

        const flatResults = batchResults.flat()
        const newCount = flatResults.filter(r => r.isNew).length

        flatResults.forEach(({ release }) => {
            existingReleases.set(release.id, release)
        })

        return {
            newReleases: flatResults.map(r => r.release),
            newCount
        }
    }
}

export const useGithubStore = defineStore('github', {
    state: () => ({
        releases: [] as ReleaseObj[],
        loading: false,
        backgroundLoading: false,
        error: null as string | null,
        lastFetchTimestamp: null as number | null,
        pageSize: 60,
        db: null as IDBPDatabase<GithubReleasesDBSchema> | null,
        reposProcessed: 0,
        retries: 0,
        rateLimitCost: 0,
        rateLimitRemaining: 5000,
        rateLimitResetAt: null as string | null,
        cachedEtag: null as string | null,
        cursor: null as string | null,
        additionalReleaseCursors: {} as Record<string, string | null>,
        additionalFetchQueue: [] as string[],
        additionalFetchCounts: {} as Record<string, number>,
        additionalFetchInProgress: false,
    }),

    actions: {
        setError(error: any) {
            this.error = error?.message || 'An unknown error occurred'
            this.loading = false
            this.backgroundLoading = false
        },

        clearData() {
            this.releases = []
            this.loading = false
            this.backgroundLoading = false
            this.error = null
            this.lastFetchTimestamp = null
            this.reposProcessed = 0
            this.retries = 0
            this.rateLimitCost = 0
            this.additionalReleaseCursors = {}
            this.additionalFetchQueue = []
            this.additionalFetchCounts = {}
            this.additionalFetchInProgress = false
        },

        async initDB() {
            // Only initialize IndexedDB in the browser
            if (process.server) {
                return
            }

            try {
                this.db = await openDB<GithubReleasesDBSchema>('github-releases', 2, {
                    upgrade(db, oldVersion) {
                        // Create stores if they don't exist
                        if (!db.objectStoreNames.contains('descriptions')) {
                            db.createObjectStore('descriptions')
                        }
                        
                        if (!db.objectStoreNames.contains('releases')) {
                            const releasesStore = db.createObjectStore('releases', {
                                keyPath: 'id'
                            })
                            releasesStore.createIndex('publishedAt', 'publishedAt')
                            releasesStore.createIndex('cachedAt', 'cachedAt')
                        }

                        if (!db.objectStoreNames.contains('metadata')) {
                            db.createObjectStore('metadata')
                        }
                    }
                })

                // Load metadata
                const metadata = await this.db.get('metadata', METADATA_KEY)
                if (metadata) {
                    this.lastFetchTimestamp = metadata.lastFetchTimestamp
                    this.cachedEtag = metadata.etag || null
                }
            } catch (error) {
                console.error('Failed to initialize IndexedDB:', error)
            }
        },

        async loadCachedReleases() {
            if (process.server) {
                return false
            }

            if (!this.db) {
                await this.initDB()
            }
            if (!this.db) return false

            try {
                // Get all releases from IndexedDB
                const allCachedReleases = await this.db.getAll('releases')
                if (allCachedReleases.length > 0) {
                    // Sort by publishedAt descending
                    this.releases = releaseProcessingHelpers.sortReleases(
                        allCachedReleases.map(({ cachedAt, ...release }) => release)
                    )
                    return true
                }
            } catch (error) {
                console.error('Error loading cached releases:', error)
            }
            return false
        },

        async updateMetadata() {
            if (process.server || !this.db) return
            await this.db.put('metadata', {
                lastFetchTimestamp: Date.now(),
                etag: this.cachedEtag
            }, METADATA_KEY)
        },

        shouldRefetch(): boolean {
            if (!this.lastFetchTimestamp) return true
            return Date.now() - this.lastFetchTimestamp > STALE_THRESHOLD
        },

        updateRateLimit(rateLimit: { cost: number; remaining: number; resetAt: string }) {
            this.rateLimitCost += rateLimit.cost
            this.rateLimitRemaining = rateLimit.remaining
            this.rateLimitResetAt = rateLimit.resetAt
        },

        async clearCache() {
            if (!this.db) {
                await this.initDB()
            }
            if (!this.db) return

            try {
                // Clear all stores
                await this.db.clear('descriptions')
                await this.db.clear('releases')
                await this.db.clear('metadata')
                
                // Reset store state
                this.lastFetchTimestamp = null
                this.cachedEtag = null
                this.releases = []
                this.additionalReleaseCursors = {}
                this.additionalFetchQueue = []
                this.additionalFetchCounts = {}
                this.additionalFetchInProgress = false
            } catch (error) {
                console.error('Error clearing cache:', error)
            }
        },

        async processRepositories(repositories: Array<{ node: RepositoryNode }>) {
            if (!repositories.length) return 0

            const startDate = new Date()
            startDate.setMonth(startDate.getMonth() - 3)
            
            const processedNodes = new WeakMap<RepositoryNode, boolean>()
            const existingReleases = new Map(this.releases.map(r => [r.id, r]))
            let newReleasesCount = 0

            // Process in smaller batches
            for (let i = 0; i < repositories.length; i += BATCH_SIZES.PROCESSING) {
                const batch = repositories.slice(i, i + BATCH_SIZES.PROCESSING)
                const batchResults = await releaseProcessingHelpers.processResponseBatch(
                    batch,
                    { startDate, db: this.db, existingReleases, processedNodes }
                )

                // Merge new releases with existing ones and sort
                this.releases = releaseProcessingHelpers.sortReleases(
                    Array.from(existingReleases.values())
                )

                newReleasesCount += batchResults.newCount
                this.reposProcessed++

                // Add small delay between batches
                if (i + BATCH_SIZES.PROCESSING < repositories.length) {
                    await new Promise(resolve => setTimeout(resolve, 100))
                }
            }

            return newReleasesCount
        },


        async cleanup() {
            if (this.db) {
                await this.db.close()
                this.db = null
            }
            this.clearData()
        }
    }
})

export interface ReleaseObj {
    id: string
    name: string
    tagName: string
    url: string
    publishedAt: string
    descriptionHTML: string
    isPrerelease: boolean
    isDraft: boolean
    repo: {
        id: string
        name: string
        url: string
        stargazerCount: number
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

export const useGithub = () => {
    const store = useGithubStore()
    const { loggedIn, session, fetch: fetchSession } = useUserSession()
    const startingDate = new Date()
    startingDate.setMonth(startingDate.getMonth() - 3)


    // Query execution moved server-side to avoid CORS and improve reliability

    // Debounced batched details fetcher (client-only)
    const pendingDetailIds = new Set<string>()
    let detailsDebounceTimer: ReturnType<typeof setTimeout> | null = null
    let detailsInFlight = false

    const flushDetailsBatch = async () => {
        if (process.server) return
        if (detailsInFlight) return
        const ids = Array.from(pendingDetailIds).slice(0, 50)
        if (ids.length === 0) return
        ids.forEach(id => pendingDetailIds.delete(id))
        detailsInFlight = true
        try {
            const result = await fetchWithRetry(async () =>
                $fetch<{ items: Array<{ id: string; descriptionHTML: string }> }>(
                    '/api/github/release-details',
                    { method: 'POST', body: { ids } }
                )
            )
            const items = result?.items || []
            if (items.length && store.db) {
                for (const it of items) {
                    const idx = store.releases.findIndex(r => r.id === it.id)
                    if (idx !== -1) {
                        const rel = store.releases[idx]
                        if (!rel) continue
                        if (!rel.descriptionHTML) {
                            rel.descriptionHTML = it.descriptionHTML || ''
                            const descriptionKey = `${rel.id}-${rel.publishedAt}`
                            await store.db.put('descriptions', rel.descriptionHTML, descriptionKey)
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Failed to populate release descriptions (batch)', e)
        } finally {
            detailsInFlight = false
            // If there are more pending IDs accumulated during flight, schedule another flush soon
            if (pendingDetailIds.size > 0) {
                scheduleDetailsFlush(50)
            }
        }
    }

    const scheduleDetailsFlush = (delayMs = 150) => {
        if (detailsDebounceTimer) return
        detailsDebounceTimer = setTimeout(() => {
            detailsDebounceTimer = null
            // flush up to 50 per batch; further ones will reschedule automatically
            void flushDetailsBatch()
        }, delayMs)
    }

    const populateDescriptionsForMissing = async (limit = 20) => {
        if (process.server) return
        const missing = store.releases
            .filter(r => !r.descriptionHTML || r.descriptionHTML.length === 0)
            .slice(0, limit)
        if (missing.length === 0) return
        for (const m of missing) {
            pendingDetailIds.add(m.id)
        }
        scheduleDetailsFlush(150)
    }

    const scheduleRepoAdditionalFetch = (repoId: string, cursor: string | null) => {
        if (!repoId) return
        const count = store.additionalFetchCounts[repoId] || 0
        if (count >= MAX_ADDITIONAL_BATCHES_PER_REPO) {
            store.additionalReleaseCursors[repoId] = null
            return
        }
        const validCursor = cursor && cursor.length > 4 ? cursor : null
        store.additionalReleaseCursors[repoId] = validCursor
        if (!validCursor) return
        if (!store.additionalFetchQueue.includes(repoId)) {
            store.additionalFetchQueue.push(repoId)
            void processAdditionalQueue()
        }
    }

    const processAdditionalQueue = async () => {
        if (process.server) return
        if (store.additionalFetchInProgress) return
        store.additionalFetchInProgress = true
        try {
            while (store.additionalFetchQueue.length) {
                const repoId = store.additionalFetchQueue.shift()
                if (!repoId) continue
                const cursor = store.additionalReleaseCursors[repoId]
                if (!cursor || cursor.length <= 4) {
                    store.additionalReleaseCursors[repoId] = null
                    continue
                }
                const count = store.additionalFetchCounts[repoId] || 0
                if (count >= MAX_ADDITIONAL_BATCHES_PER_REPO) {
                    store.additionalReleaseCursors[repoId] = null
                    continue
                }
                try {
                    const response = await fetchWithRetry(async () =>
                        $fetch<RepoReleasesResponse>('/api/github/repo-releases', {
                            method: 'POST',
                            body: {
                                repoId,
                                cursor,
                                limit: ADDITIONAL_RELEASE_BATCH_SIZE,
                                withDetails: false
                            }
                        })
                    )
                    const repoNode = response?.repository
                    if (!repoNode?.releases?.edges?.length) {
                        store.additionalReleaseCursors[repoId] = null
                        continue
                    }

                    const existingReleases = new Map(store.releases.map(r => [r.id, r]))
                    const processedNodes = new WeakMap<RepositoryNode, boolean>()
                    const batchOutcome = await releaseProcessingHelpers.processResponseBatch(
                        [{ node: repoNode }],
                        {
                            startDate: startingDate,
                            db: store.db,
                            existingReleases,
                            processedNodes
                        }
                    )
                    store.releases = releaseProcessingHelpers.sortReleases(
                        Array.from(existingReleases.values())
                    )

                    const addedCount = batchOutcome.newCount
                    if (addedCount === 0) {
                        store.additionalReleaseCursors[repoId] = null
                        continue
                    }

                    store.additionalFetchCounts[repoId] = count + 1

                    const nextCursor = repoNode.releases?.pageInfo?.hasNextPage
                        ? repoNode.releases.pageInfo.endCursor ?? null
                        : null
                    if (!nextCursor || nextCursor === cursor) {
                        store.additionalReleaseCursors[repoId] = null
                    } else {
                        store.additionalReleaseCursors[repoId] = nextCursor
                    }

                    if (response.rateLimit) {
                        store.updateRateLimit(response.rateLimit)
                    }

                    if (
                        nextCursor &&
                        nextCursor !== cursor &&
                        store.additionalReleaseCursors[repoId] &&
                        store.additionalFetchCounts[repoId] < MAX_ADDITIONAL_BATCHES_PER_REPO
                    ) {
                        store.additionalFetchQueue.push(repoId)
                    }
                } catch (error) {
                    console.error('Failed to fetch additional repo releases', error)
                }
            }
        } finally {
            store.additionalFetchInProgress = false
        }
    }

    const fetchWithRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
        try {
            return await fn()
        } catch (error: any) {
            if (retries === 0) throw error
            store.retries++
            await new Promise(resolve => setTimeout(resolve, delay))
            return fetchWithRetry(fn, retries - 1, delay * 2)
        }
    }

    const processResponse = async (response: GraphQLResponse, cursor: string | null) => {
        if (!response?.viewer?.starredRepositories) {
            console.error('Invalid GitHub API response:', response)
            throw new Error('Invalid response from GitHub API. Please try again.')
        }

        const { edges, pageInfo } = response.viewer.starredRepositories
        store.updateRateLimit(response.rateLimit)

        if (!Array.isArray(edges)) {
            throw new Error('Invalid response format: edges is not an array')
        }

        // Set background loading when processing data
        if (cursor) {
            store.backgroundLoading = true
        }

        // Create a Map of existing releases for faster lookup
        const existingReleases = new Map(store.releases.map(r => [r.id, r]))
        let newReleasesCount = 0
        const processedNodes = new WeakMap<RepositoryNode, boolean>()

        // Process repositories in parallel batches
        const BATCH_SIZE = 5 // Process 5 repos at a time
        for (let i = 0; i < edges.length; i += BATCH_SIZE) {
            const batch = edges.slice(i, i + BATCH_SIZE)
            
            // Process batch using shared helper
            const batchResults = await releaseProcessingHelpers.processResponseBatch(
                batch,
                {
                    startDate: startingDate,
                    db: store.db,
                    existingReleases,
                    processedNodes
                }
            )

            newReleasesCount += batchResults.newCount
            store.reposProcessed++
            
            // Update the store's releases with all releases from the map
            store.releases = releaseProcessingHelpers.sortReleases(
                Array.from(existingReleases.values())
            )
        }

        // Update metadata after successful fetch
        const seenRepos = new Set<string>()
        for (const edge of edges) {
            const repo = edge?.node
            if (!repo?.id) continue
            if (seenRepos.has(repo.id)) continue
            seenRepos.add(repo.id)
            const nextCursor = repo.releases?.pageInfo?.hasNextPage
                ? repo.releases.pageInfo.endCursor ?? null
                : null
            if (repo.releases?.pageInfo?.hasNextPage && nextCursor) {
                scheduleRepoAdditionalFetch(repo.id, nextCursor)
            } else {
                store.additionalReleaseCursors[repo.id] = null
            }
        }

        await store.updateMetadata()

        // Check rate limit and cost information
        if (response.rateLimit.remaining <= 0) {
            const resetDate = new Date(response.rateLimit.resetAt)
            const resetIn = Math.ceil((resetDate.getTime() - Date.now()) / 1000 / 60)
            store.setError(new Error(
                `GitHub API rate limit reached (${response.rateLimit.used}/${response.rateLimit.limit}, ` +
                `Cost: ${store.rateLimitCost}). ` +
                `Resets in ${resetIn} minutes at ${resetDate.toLocaleTimeString()}`
            ))
            return // setError already resets loading states
        }

        // Opportunistically start fetching missing descriptions for top items
        if (!process.server) {
            // fire-and-forget to avoid blocking pagination
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            populateDescriptionsForMissing(20)
        }

        // Only continue fetching if we're finding new releases
        if (pageInfo?.hasNextPage && (newReleasesCount > 0 || cursor === null)) {
            await new Promise(resolve => setTimeout(resolve, 1000))
            await fetchReleases(pageInfo.endCursor)
        } else {
            store.loading = false
            store.backgroundLoading = false
        }
    }

    const fetchReleases = async (cursor: string | null = null) => {
        if (!loggedIn.value) {
            console.error('GitHub auth failed:', {
                loggedIn: loggedIn.value,
                hasSession: !!session.value,
                hasAccessToken: !!session.value?.user?.accessToken
            })
            store.setError(new Error('Not authenticated'))
            return
        }

        try {
            if (!cursor) {
                // Initial fetch
                store.loading = true
                store.backgroundLoading = false
                store.error = null
                store.reposProcessed = 0
                store.retries = 0
                
                if (!store.db) {
                    await store.initDB()
                }

                // Only show cached releases if we're not forcing a refresh
                const hasCachedData = await store.loadCachedReleases()
                
                if (hasCachedData && !store.shouldRefetch()) {
                    store.loading = false
                    store.backgroundLoading = false
                    return
                }

                // Set loading states based on cache status
                if (hasCachedData && store.shouldRefetch()) {
                    store.loading = false
                    store.backgroundLoading = true
                }

                // Clear releases when starting a fresh fetch
                if (!hasCachedData || store.shouldRefetch()) {
                    store.releases = []
                }
            } else {
                // Subsequent fetches
                store.backgroundLoading = true
            }

            const response = await fetchWithRetry(async () =>
                $fetch<GraphQLResponse>('/api/github/releases', {
                    params: {
                        cursor,
                        pageSize: store.pageSize,
                        withDetails: false
                    }
                })
            )

            await processResponse(response, cursor)

        } catch (error: any) {
            if (error.message?.includes('Bad credentials')) {
                console.error('GitHub auth error - bad credentials:', error)
                // Session might be invalid, try to refresh it
                await fetchSession()
                if (!loggedIn.value) {
                    store.setError(new Error('Session expired. Please login again.'))
                }
            } else if (error.statusCode === 502 || error.message?.includes('502')) {
                console.error('GitHub API temporarily unavailable (502):', error)
                store.setError(new Error('GitHub API is temporarily unavailable. Retrying...'))
                // Retry after a short delay for 502 errors
                await new Promise(resolve => setTimeout(resolve, 2000))
                if (store.retries < 3) {
                    await fetchReleases(cursor)
                }
            } else {
                console.error('Error fetching GitHub releases:', error)
                store.setError(error)
            }
        }
    }

    // Watch for session changes
    watch(loggedIn, async (isLoggedIn) => {
        if (!isLoggedIn) {
            store.clearData()
        }
    })

    return {
        releases: computed(() => store.releases),
        loading: computed(() => store.loading),
        backgroundLoading: computed(() => store.backgroundLoading),
        error: computed(() => store.error),
        reposProcessed: computed(() => store.reposProcessed),
        rateLimitRemaining: computed(() => store.rateLimitRemaining),
        rateLimitResetAt: computed(() => store.rateLimitResetAt),
        retries: computed(() => store.retries),
        fetchReleases,
        clearCache: async () => await store.clearCache(),
        cleanup: async () => await store.cleanup()
    }
}
