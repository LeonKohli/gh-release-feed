// composables/useGithub.ts
import { Octokit } from '@octokit/core'
import { defineStore } from 'pinia'
import { openDB, type IDBPDatabase } from 'idb'

interface GraphQLResponse {
    viewer: {
        starredRepositories: {
            totalCount: number
            pageInfo: {
                endCursor: string | null
                hasNextPage: boolean
            }
            edges: Array<{
                node: {
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

interface RepoDetailsResponse {
    repository: {
        description: string
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
    }
}

interface DescriptionResponse {
    nodes: Array<{
        id: string
        descriptionHTML: string
        updatedAt: string
    }>
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

export const useGithubStore = defineStore('github', {
    state: () => ({
        releases: [] as ReleaseObj[],
        loading: false,
        backgroundLoading: false,
        error: null as string | null,
        lastFetchTimestamp: null as number | null,
        pageSize: 20,
        db: null as IDBPDatabase<GithubReleasesDBSchema> | null,
        reposProcessed: 0,
        retries: 0,
        rateLimitCost: 0,
        rateLimitRemaining: 5000,
        rateLimitResetAt: null as string | null,
        cachedEtag: null as string | null,
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
                    const releases = allCachedReleases
                        .map(({ cachedAt, ...release }) => release) // Remove cachedAt from the object
                        .sort((a, b) => 
                            new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
                        )
                    this.releases = releases
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
            } catch (error) {
                console.error('Error clearing cache:', error)
            }
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

    const octokit = computed(() => {
        if (!loggedIn.value || !session.value?.user?.accessToken) {

            return null
        }
        
        return new Octokit({ 
            auth: session.value.user.accessToken,
            retry: { enabled: true, retries: 3 },
            throttle: { enabled: true, minimumSecondsBetweenCalls: 1 }
        })
    })

    const recentReleasesQuery = `
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
              name
              url
              description
              owner {
                login
                avatarUrl
                url
              }
              stargazerCount
              releases(
                first: 10, 
                orderBy: {field: CREATED_AT, direction: DESC}
              ) {
                edges {
                  node {
                    id
                    isDraft
                    isPrerelease
                    name
                    tagName
                    publishedAt
                    url
                    descriptionHTML
                  }
                }
              }
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
              primaryLanguage {
                id
                name
              }
            }
          }
        }
      }
      rateLimit {
        cost
        remaining
        resetAt
      }
    }
  `

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
            throw new Error('Invalid response format from GitHub API')
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

        // Process repositories in parallel batches
        const BATCH_SIZE = 5 // Process 5 repos at a time
        for (let i = 0; i < edges.length; i += BATCH_SIZE) {
            const batch = edges.slice(i, i + BATCH_SIZE)
            
            // Process batch in parallel
            const batchResults = await Promise.all(batch.map(async edge => {
                const repoNode = edge.node
                if (!repoNode?.releases?.edges) return []
                
                const newReleases = repoNode.releases.edges
                    .map(releaseEdge => releaseEdge.node)
                    .filter(release => 
                        release && 
                        new Date(release.publishedAt) >= startingDate &&
                        !existingReleases.has(release.id)
                    )
                    .map(release => ({
                        id: release.id,
                        name: release.name,
                        tagName: release.tagName,
                        publishedAt: release.publishedAt,
                        url: release.url,
                        isDraft: release.isDraft,
                        isPrerelease: release.isPrerelease,
                        descriptionHTML: release.descriptionHTML || '',
                        repo: {
                            name: repoNode.name,
                            url: repoNode.url,
                            description: repoNode.description || '',
                            stargazerCount: repoNode.stargazerCount,
                            owner: repoNode.owner,
                            primaryLanguage: repoNode.primaryLanguage || { id: '', name: '' },
                            languages: {
                                totalCount: repoNode.languages.totalCount,
                                edges: repoNode.languages.edges
                            },
                            licenseInfo: repoNode.licenseInfo
                        }
                    }))

                if (newReleases.length === 0) return []

                // Process each release in parallel
                await Promise.all(newReleases.map(async release => {
                    // Try to get cached description first
                    if (!release.descriptionHTML && store.db) {
                        const cachedDescription = await store.db.get(
                            'descriptions',
                            `${release.id}-${release.publishedAt}`
                        )
                        if (cachedDescription) {
                            release.descriptionHTML = cachedDescription
                        }
                    }

                    // Cache the description if it exists
                    if (release.descriptionHTML && store.db) {
                        await store.db.put(
                            'descriptions',
                            release.descriptionHTML,
                            `${release.id}-${release.publishedAt}`
                        )
                    }

                    // Cache the full release object
                    if (store.db) {
                        await store.db.put('releases', {
                            ...release,
                            cachedAt: Date.now()
                        })
                    }

                    // Add to existing releases map
                    existingReleases.set(release.id, release)
                }))

                newReleasesCount += newReleases.length
                store.reposProcessed++
                
                return newReleases
            }))

            // Flatten batch results and add to releases
            const newReleases = batchResults.flat()
            
            // Update the store's releases with all releases from the map
            store.releases = Array.from(existingReleases.values()).sort((a, b) =>
                new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
            )
        }

        // Update metadata after successful fetch
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
        if (!octokit.value) {
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
                octokit.value!.graphql<GraphQLResponse>(recentReleasesQuery, { 
                    cursor,
                    pageSize: store.pageSize
                })
            )

            if (!response?.viewer?.starredRepositories) {
                throw new Error('Invalid response format from GitHub API')
            }

            await processResponse(response, cursor)

        } catch (error: any) {
            if (error.message?.includes('Bad credentials')) {
                console.error('GitHub auth error - bad credentials:', error)
                // Session might be invalid, try to refresh it
                await fetchSession()
                if (!loggedIn.value) {
                    store.setError(new Error('Session expired. Please login again.'))
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
        clearCache: async () => await store.clearCache()
    }
}