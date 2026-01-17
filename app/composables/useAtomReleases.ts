// Smart release fetching using Atom feeds (no rate limits!)
// Two-phase approach:
// 1. Get starred repos list (minimal GraphQL - 1-3 API calls)
// 2. Fetch releases via Atom feeds (NO rate limits - parallel fetch)

import { defineStore } from 'pinia'

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

interface AtomRelease {
  id: string
  title: string
  link: string
  updated: string
  content: string
  author: string
}

interface AtomFeedResult {
  repo: string
  owner: string
  releases: AtomRelease[]
  error?: string
}

export interface NormalizedRelease {
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
    owner: {
      login: string
      avatarUrl: string
      url: string
    }
    stargazerCount: number
    primaryLanguage: { id: string; name: string } | null
    languages: { edges: Array<{ node: { id: string; name: string } }> }
    licenseInfo: { spdxId: string } | null
  }
}

// Store for atom-based releases
export const useAtomReleasesStore = defineStore('atomReleases', {
  state: () => ({
    starredRepos: [] as StarredRepo[],
    releases: [] as NormalizedRelease[],
    loading: false,
    loadingRepos: false,
    loadingReleases: false,
    error: null as string | null,
    reposProcessed: 0,
    totalRepos: 0,
    lastFetchedAt: null as number | null,
  }),

  getters: {
    sortedReleases: (state) => {
      return [...state.releases].sort((a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      )
    }
  },

  actions: {
    setLoading(loading: boolean) {
      this.loading = loading
    },
    setError(error: string | null) {
      this.error = error
    },
    addReleases(releases: NormalizedRelease[]) {
      // Merge with existing, avoiding duplicates
      const existingIds = new Set(this.releases.map(r => r.id))
      const newReleases = releases.filter(r => !existingIds.has(r.id))
      this.releases.push(...newReleases)
    }
  }
})

export function useAtomReleases() {
  const store = useAtomReleasesStore()

  // Fetch starred repos list (lightweight - just owner/name)
  async function fetchStarredRepos(): Promise<StarredRepo[]> {
    store.loadingRepos = true
    store.error = null
    const allRepos: StarredRepo[] = []
    let cursor: string | null = null
    let hasMore = true

    try {
      while (hasMore) {
        const params = new URLSearchParams({ pageSize: '100' })
        if (cursor) params.set('cursor', cursor)

        const response = await $fetch<{
          repos: StarredRepo[]
          totalCount: number
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
        }>(`/api/github/starred-repos?${params}`)

        allRepos.push(...response.repos)
        store.totalRepos = response.totalCount
        store.reposProcessed = allRepos.length

        hasMore = response.pageInfo.hasNextPage
        cursor = response.pageInfo.endCursor

        // Small delay between pages to be nice
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      store.starredRepos = allRepos
      return allRepos
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch starred repos'
      store.error = message
      throw err
    } finally {
      store.loadingRepos = false
    }
  }

  // Fetch releases via Atom feeds (NO rate limits!)
  async function fetchAtomReleases(repos: StarredRepo[]): Promise<NormalizedRelease[]> {
    store.loadingReleases = true
    store.error = null

    try {
      // Larger batches since server handles concurrency with auth
      const batchSize = 100
      for (let i = 0; i < repos.length; i += batchSize) {
        const batch = repos.slice(i, i + batchSize)
        const batchReleases: NormalizedRelease[] = []

        const response = await $fetch<{
          results: AtomFeedResult[]
          errors: Array<{ repo: string; error: string }>
        }>('/api/github/atom-releases', {
          method: 'POST',
          body: {
            repos: batch.map(r => ({ owner: r.owner, name: r.name }))
          }
        })

        // Convert Atom releases to normalized format
        for (const result of response.results) {
          const repo = repos.find(r => r.name === result.repo && r.owner === result.owner)
          if (!repo) continue

          for (const release of result.releases) {
            // Parse tag name from URL
            const tagMatch = release.link.match(/\/releases\/tag\/(.+)$/)
            const tagName = tagMatch && tagMatch[1] ? decodeURIComponent(tagMatch[1]) : release.title

            // Detect pre-release from title or content
            const isPrerelease = /pre-?release|alpha|beta|rc\d*|canary/i.test(release.title)
            const isDraft = /draft/i.test(release.title)

            const normalized: NormalizedRelease = {
              id: release.id,
              name: release.title,
              tagName,
              url: release.link,
              publishedAt: release.updated,
              descriptionHTML: release.content,
              isPrerelease,
              isDraft,
              repo: {
                id: repo.id,
                name: repo.name,
                url: repo.url,
                owner: {
                  login: repo.owner,
                  avatarUrl: repo.avatarUrl,
                  url: `https://github.com/${repo.owner}`
                },
                stargazerCount: repo.stargazerCount,
                primaryLanguage: repo.primaryLanguage,
                languages: { edges: (repo.languages || []).map(lang => ({ node: lang })) },
                licenseInfo: repo.licenseInfo
              }
            }

            batchReleases.push(normalized)
          }
        }

        // Add releases immediately after each batch - shows progress to user
        if (batchReleases.length > 0) {
          store.addReleases(batchReleases)
        }

        store.reposProcessed = Math.min(i + batchSize, repos.length)

        // Log any errors
        if (response.errors.length > 0) {
          console.warn(`[atom] ${response.errors.length} repos had errors:`, response.errors.slice(0, 5))
        }
      }

      store.lastFetchedAt = Date.now()
      return store.releases
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch releases'
      store.error = message
      throw err
    } finally {
      store.loadingReleases = false
    }
  }

  // Main function: Two-phase fetch
  async function fetchAllReleases() {
    store.loading = true
    store.reposProcessed = 0
    store.error = null

    try {
      // Phase 1: Get starred repos (1-3 GraphQL calls)
      console.info('[atom] Phase 1: Fetching starred repos list...')
      const repos = await fetchStarredRepos()
      console.info(`[atom] Found ${repos.length} starred repos`)

      // Phase 2: Fetch releases via Atom (NO rate limits!)
      console.info('[atom] Phase 2: Fetching releases via Atom feeds...')
      await fetchAtomReleases(repos)
      console.info(`[atom] Fetched ${store.releases.length} releases`)

      return store.sortedReleases
    } catch (err) {
      console.error('[atom] Error fetching releases:', err)
      throw err
    } finally {
      store.loading = false
    }
  }

  // Incremental refresh - only fetch if stale
  async function refreshIfStale(maxAgeMs = 5 * 60 * 1000) {
    if (store.lastFetchedAt && Date.now() - store.lastFetchedAt < maxAgeMs) {
      console.info('[atom] Data is fresh, skipping refresh')
      return store.sortedReleases
    }

    return fetchAllReleases()
  }

  // Clear all data
  function clearCache() {
    store.starredRepos = []
    store.releases = []
    store.lastFetchedAt = null
  }

  return {
    // State
    releases: computed(() => store.sortedReleases),
    loading: computed(() => store.loading),
    loadingRepos: computed(() => store.loadingRepos),
    loadingReleases: computed(() => store.loadingReleases),
    error: computed(() => store.error),
    reposProcessed: computed(() => store.reposProcessed),
    totalRepos: computed(() => store.totalRepos),
    lastFetchedAt: computed(() => store.lastFetchedAt),

    // Actions
    fetchAllReleases,
    refreshIfStale,
    clearCache,
  }
}
