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
        token: null as string | null,
        releases: [] as ReleaseObj[],
        loading: false,
        progress: 0,
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
        setToken(token: string) {
            this.token = token
            localStorage.setItem('github_token', token)
        },

        clearToken() {
            this.token = null
            this.releases = []
            this.loading = false
            this.progress = 0
            this.error = null
            this.lastFetchTimestamp = null
            this.reposProcessed = 0
            this.retries = 0
            localStorage.removeItem('github_token')
        },

        setError(error: any) {
            this.error = error?.message || 'An unknown error occurred'
            this.loading = false
        },

        async initDB() {
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
            if (!this.db) {
                await this.initDB()
            }
            if (!this.db) return

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
            if (!this.db) return
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
        }
    }
})

export interface ReleaseObj {
    id: string
    name: string
    publishedAt: string
    updatedAt: string
    url: string
    isDraft: boolean
    isPrerelease: boolean
    descriptionHTML?: string
    repo: {
        name: string
        description: string
        url: string
        stargazerCount: number
        owner: {
            login: string
            avatarUrl: string
            url: string
        }
        primaryLanguage: {
            id: string
            name: string
        }
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
    }
}

export const useGithub = () => {
    const store = useGithubStore()
    const startingDate = new Date()
    startingDate.setMonth(startingDate.getMonth() - 3)

    const octokit = computed(() =>
        store.token ? new Octokit({ 
            auth: store.token,
            retry: { enabled: true, retries: 3 },
            throttle: { enabled: true, minimumSecondsBetweenCalls: 1 }
        }) : null
    )

    const recentReleasesQuery = `
    query($cursor: String, $pageSize: Int!) {
      viewer {
        starredRepositories(first: $pageSize, after: $cursor, orderBy: {field: STARRED_AT, direction: DESC}) {
          totalCount
          pageInfo {
            endCursor
            hasNextPage
          }
          edges {
            node {
              name
              url
            description
              languages(first: 10) {
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
              owner {
                login
                avatarUrl
                url
              }
              stargazerCount
              releases(first: 10, orderBy: { field: CREATED_AT, direction: DESC }) {
                totalCount
                pageInfo {
                  hasNextPage
                  endCursor
                }
                edges {
                  node {
                id
                isDraft
                isPrerelease
                name
                publishedAt
                updatedAt
                url
                    descriptionHTML
                  }
                }
              }
            }
          }
        }
      }
      rateLimit {
        cost
        limit
        remaining
        resetAt
        used
      }
    }
  `

    const fetchWithRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
        try {
            return await fn()
        } catch (error: any) {
            if (retries === 0) throw error
            store.retries++
            console.log(`Retrying Request - Retry #${store.retries}`)
            await new Promise(resolve => setTimeout(resolve, delay))
            return fetchWithRetry(fn, retries - 1, delay * 2)
        }
    }

    const processResponse = async (response: GraphQLResponse, cursor: string | null) => {
        if (!response?.viewer?.starredRepositories) {
            throw new Error('Invalid response format from GitHub API')
        }

        const { edges, pageInfo, totalCount } = response.viewer.starredRepositories
        store.updateRateLimit(response.rateLimit)

        if (!Array.isArray(edges)) {
            throw new Error('Invalid response format: edges is not an array')
        }

        const existingIds = new Set(store.releases.map(r => r.id))
        let newReleasesCount = 0

        for (const edge of edges) {
            const repoNode = edge.node
            if (!repoNode?.releases?.edges) continue
            
            const newReleases = repoNode.releases.edges
                .map(releaseEdge => releaseEdge.node)
                .filter(release => 
                    release && 
                    new Date(release.publishedAt) >= startingDate &&
                    !existingIds.has(release.id)
                )
                .map(release => ({
                    id: release.id,
                    name: release.name,
                    publishedAt: release.publishedAt,
                    updatedAt: release.updatedAt,
                    url: release.url,
                    isDraft: release.isDraft,
                    isPrerelease: release.isPrerelease,
                    descriptionHTML: release.descriptionHTML || undefined,
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

            if (newReleases.length === 0) continue

            for (const release of newReleases) {
                // Try to get cached description first
                if (!release.descriptionHTML && store.db) {
                    const cachedDescription = await store.db.get(
                        'descriptions',
                        `${release.id}-${release.updatedAt}`
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
                        `${release.id}-${release.updatedAt}`
                    )
                }

                // Cache the full release object
                if (store.db) {
                    await store.db.put('releases', {
                        ...release,
                        cachedAt: Date.now()
                    })
                }

                existingIds.add(release.id)
            }

            store.releases = [...store.releases, ...newReleases].sort((a, b) =>
                new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
            )

            newReleasesCount += newReleases.length
            store.reposProcessed++
            store.progress = store.reposProcessed / totalCount
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
            store.loading = false
            return
        }

        // Only continue fetching if we're finding new releases
        if (pageInfo?.hasNextPage && (newReleasesCount > 0 || cursor === null)) {
            await new Promise(resolve => setTimeout(resolve, 1000))
            await fetchReleases(pageInfo.endCursor)
        } else {
            store.loading = false
        }
    }

    const fetchReleases = async (cursor: string | null = null) => {
        if (!octokit.value) {
            store.setError(new Error('GitHub token not set'))
            return
        }

        try {
            if (!cursor) {
                // Only show loading state for initial fetch
                store.loading = true
                store.progress = 0
                store.error = null
                store.reposProcessed = 0
                store.retries = 0
                
                // Initialize DB if needed
                if (!store.db) {
                    await store.initDB()
                }

                // Try to load cached data first
                const hasCachedData = await store.loadCachedReleases()
                
                // If we have cached data and it's not stale, skip the fetch
                if (hasCachedData && !store.shouldRefetch()) {
                    store.loading = false
                    return
                }
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
            if (error.message?.includes('NetworkError')) {
                store.setError(new Error('Network error. Please check your internet connection and try again.'))
            } else if (error.message?.includes('Bad credentials')) {
                store.setError(new Error('Invalid GitHub token. Please check your token and try again.'))
            } else {
                store.setError(error)
            }
            console.error('Error fetching releases:', error)
            store.loading = false
        }
    }

    return {
        releases: computed(() => store.releases),
        loading: computed(() => store.loading),
        progress: computed(() => store.progress),
        error: computed(() => store.error),
        token: computed(() => store.token),
        fetchReleases,
        setToken: store.setToken,
        clearToken: store.clearToken
    }
}