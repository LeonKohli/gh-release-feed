import type { ReleaseObj } from '~/composables/useGithub'

export type ReleaseType = 'all' | 'stable' | 'prerelease'
export type SearchScope = 'titles' | 'notes'
export interface RepositoryOption {
  id: string
  label: string
  description: string
  count: number
}

export function isReleaseType(value: unknown): value is ReleaseType {
  return value === 'all' || value === 'stable' || value === 'prerelease'
}

const notesText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function filterReleases(
  releases: ReleaseObj[],
  type: ReleaseType,
  search: string,
  options: { repositoryId?: string | null; searchIn?: SearchScope } = {},
) {
  const query = search.trim().toLowerCase()
  return releases.filter((release) => {
    if (release.isDraft || !release.publishedAt) return false
    if (options.repositoryId && release.repo.id !== options.repositoryId) return false
    if (type === 'stable' && release.isPrerelease) return false
    if (type === 'prerelease' && !release.isPrerelease) return false
    if (!query) return true
    const fields =
      options.searchIn === 'notes'
        ? [notesText(release.descriptionHTML)]
        : [release.name, release.tagName]
    return fields.some((value) => value.toLowerCase().includes(query))
  })
}

export function getRepositoryOptions(releases: ReleaseObj[]): RepositoryOption[] {
  const repositories = new Map<string, RepositoryOption>()
  for (const release of releases) {
    if (release.isDraft || !release.publishedAt) continue
    const existing = repositories.get(release.repo.id)
    if (existing) existing.count++
    else
      repositories.set(release.repo.id, {
        id: release.repo.id,
        label: `${release.repo.owner.login}/${release.repo.name}`,
        description: release.repo.description || '',
        count: 1,
      })
  }
  return [...repositories.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function getNoteMatch(html: string, search: string) {
  const query = search.trim()
  if (!query) return null
  const text = notesText(html)
  const position = text.toLowerCase().indexOf(query.toLowerCase())
  if (position < 0) return null
  const start = Math.max(0, position - 60)
  const end = Math.min(text.length, position + query.length + 100)
  return {
    before: `${start ? '…' : ''}${text.slice(start, position)}`,
    match: text.slice(position, position + query.length),
    after: `${text.slice(position + query.length, end)}${end < text.length ? '…' : ''}`,
  }
}
