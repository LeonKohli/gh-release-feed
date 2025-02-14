import type { ReleaseObj } from './useGithub'
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

  const getCacheKey = (releases: ReleaseObj[]): string => {
    return releases.map(r => `${r.id}-${r.publishedAt}`).join('|')
  }

  const groupReleases = (releases: ReleaseObj[]): ReleaseGroup[] => {
    if (!releases.length) return []

    // Check cache first
    const cacheKey = getCacheKey(releases)
    if (cache.has(cacheKey)) {
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
    return groups
  }

  const formatGroupTimeDiff = (group: ReleaseGroup) => {
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
  }

  return {
    groupReleases,
    formatGroupTimeDiff,
    clearCache,
  }
}) 