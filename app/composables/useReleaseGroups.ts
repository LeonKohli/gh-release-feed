import type { NormalizedRelease } from './useAtomReleases'

type ReleaseObj = NormalizedRelease
import { differenceInHours, differenceInMinutes } from 'date-fns'
import { createSharedComposable } from '@vueuse/core'

export interface ReleaseGroup {
  id: string
  releases: ReleaseObj[]
  publishedAt: string
  repo: {
    name: string
    url: string
    owner: {
      login: string
      url: string
      avatarUrl: string
    }
  }
  isSingleRelease: boolean
}

export const useReleaseGroups = createSharedComposable(() => {
  const TIME_THRESHOLD = 2 // hours
  
  // Create a cache map for memoization
  const cache = new Map<string, ReleaseGroup[]>()
  // Track last releases reference for quick invalidation check
  let lastReleasesRef: ReleaseObj[] | null = null
  let lastCacheKey: string | null = null

  // O(1) cache key using length + boundary IDs (sufficient for sorted arrays)
  const getCacheKey = (releases: ReleaseObj[]): string => {
    if (releases.length === 0) return 'empty'
    const first = releases[0]
    const last = releases[releases.length - 1]
    // For sorted arrays, length + first + last is sufficient for cache invalidation
    return `${releases.length}:${first?.id || ''}:${last?.id || ''}`
  }

  const groupReleases = (releases: ReleaseObj[]): ReleaseGroup[] => {
    if (!releases.length) return []

    // Fast path: same array reference = same results
    if (releases === lastReleasesRef && lastCacheKey && cache.has(lastCacheKey)) {
      return cache.get(lastCacheKey)!
    }

    // Check cache by key
    const cacheKey = getCacheKey(releases)
    if (cache.has(cacheKey)) {
      lastReleasesRef = releases
      lastCacheKey = cacheKey
      return cache.get(cacheKey)!
    }

    const groups: ReleaseGroup[] = []
    let currentGroup: ReleaseObj[] = []
    
    // Sort releases by date (newest first) and repo
    const sortedReleases = [...releases].sort((a, b) => {
      const dateCompare = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      if (dateCompare !== 0) return dateCompare
      
      // If same timestamp, sort by repo name
      return `${a.repo.owner.login}/${a.repo.name}`.localeCompare(`${b.repo.owner.login}/${b.repo.name}`)
    })

    for (const release of sortedReleases) {
      const lastRelease = currentGroup[currentGroup.length - 1]

      const shouldStartNewGroup = () => {
        if (!lastRelease) return false
        
        // Check if same repo
        const isSameRepo = lastRelease.repo.name === release.repo.name && 
                          lastRelease.repo.owner.login === release.repo.owner.login
        
        if (!isSameRepo) return true

        // Check time difference
        const timeDiff = differenceInHours(
          new Date(lastRelease.publishedAt),
          new Date(release.publishedAt)
        )

        return Math.abs(timeDiff) > TIME_THRESHOLD
      }

      if (shouldStartNewGroup() && currentGroup.length > 0) {
        // Create a new group from current releases
        const firstRelease = currentGroup[0]
        if (!firstRelease) continue // Skip if no first release (shouldn't happen due to length check)

        groups.push({
          id: `${firstRelease.repo.owner.login}/${firstRelease.repo.name}-${firstRelease.publishedAt}`,
          releases: [...currentGroup],
          publishedAt: firstRelease.publishedAt,
          repo: {
            name: firstRelease.repo.name,
            url: firstRelease.repo.url,
            owner: { ...firstRelease.repo.owner }
          },
          isSingleRelease: currentGroup.length === 1
        })
        currentGroup = []
      }

      currentGroup.push(release)
    }

    // Add the last group if it exists
    if (currentGroup.length > 0) {
      const firstRelease = currentGroup[0]
      if (!firstRelease) return groups // Skip if no first release (shouldn't happen due to length check)

      groups.push({
        id: `${firstRelease.repo.owner.login}/${firstRelease.repo.name}-${firstRelease.publishedAt}`,
        releases: [...currentGroup],
        publishedAt: firstRelease.publishedAt,
        repo: {
          name: firstRelease.repo.name,
          url: firstRelease.repo.url,
          owner: { ...firstRelease.repo.owner }
        },
        isSingleRelease: currentGroup.length === 1
      })
    }

    // Store result in cache before returning
    cache.set(cacheKey, groups)
    lastReleasesRef = releases
    lastCacheKey = cacheKey
    return groups
  }

  const formatGroupTimeDiff = (group: Pick<ReleaseGroup, 'releases'>) => {
    if (!group.releases || group.releases.length <= 1) return null

    const first = group.releases[0]
    const last = group.releases[group.releases.length - 1]
    
    if (!first || !last) return null

    const newest = new Date(first.publishedAt)
    const oldest = new Date(last.publishedAt)
    
    const hoursDiff = differenceInHours(newest, oldest)
    const minutesDiff = differenceInMinutes(newest, oldest)

    if (hoursDiff > 0) {
      return `${hoursDiff}h ${minutesDiff % 60}m`
    }
    return `${minutesDiff}m`
  }

  // Add cache clearing method
  const clearCache = () => {
    cache.clear()
    lastReleasesRef = null
    lastCacheKey = null
  }

  return {
    groupReleases,
    formatGroupTimeDiff,
    clearCache,
  }
}) 