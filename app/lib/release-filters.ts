import type { ReleaseObj } from '~/composables/useGithub'

export type ReleaseType = 'all' | 'stable' | 'prerelease'

export function isReleaseType(value: unknown): value is ReleaseType {
  return value === 'all' || value === 'stable' || value === 'prerelease'
}

export function filterReleases(releases: ReleaseObj[], type: ReleaseType, search: string) {
  const query = search.trim().toLowerCase()
  return releases.filter((release) => {
    if (release.isDraft || !release.publishedAt) return false
    if (type === 'stable' && release.isPrerelease) return false
    if (type === 'prerelease' && !release.isPrerelease) return false
    if (!query) return true

    return [
      release.repo.name,
      release.repo.owner.login,
      release.repo.description,
      release.name,
      release.tagName,
      release.descriptionHTML.replace(/<[^>]*>/g, ' '),
    ].some((value) => value?.toLowerCase().includes(query))
  })
}
