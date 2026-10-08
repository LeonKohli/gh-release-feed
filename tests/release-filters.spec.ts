import type { ReleaseObj } from '../app/composables/useGithub'
import type { ReleaseType } from '../app/lib/release-filters'
import { describe, expect, it } from 'vitest'
import { filterReleases } from '../app/lib/release-filters'

function release(id: string, overrides: Partial<ReleaseObj> = {}): ReleaseObj {
  return {
    id,
    name: 'Version 2.0',
    tagName: 'v2.0',
    url: `https://github.com/render-labs/mcopt/releases/tag/${id}`,
    publishedAt: '2026-10-08T10:00:00Z',
    descriptionHTML: '<p>Faster rendering</p>',
    isDraft: false,
    isPrerelease: false,
    repo: {
      id: 'render-labs/mcopt',
      name: 'mcopt',
      description: 'Native Metal renderer',
      url: 'https://github.com/render-labs/mcopt',
      stargazerCount: 382,
      owner: {
        login: 'render-labs',
        url: 'https://github.com/render-labs',
        avatarUrl: '',
      },
      licenseInfo: null,
      primaryLanguage: null,
      languages: { edges: [] },
    },
    ...overrides,
  }
}

describe('release filters', () => {
  it.each<{ type: ReleaseType; expected: string[] }>([
    { type: 'all', expected: ['stable', 'preview'] },
    { type: 'stable', expected: ['stable'] },
    { type: 'prerelease', expected: ['preview'] },
  ])('shows $type releases and excludes drafts and unpublished entries', ({ type, expected }) => {
    const releases = [
      release('stable'),
      release('preview', { isPrerelease: true }),
      release('draft', { isDraft: true }),
      release('unpublished', { publishedAt: '' }),
    ]

    expect(filterReleases(releases, type, '').map((item) => item.id)).toEqual(expected)
  })

  it.each([
    { field: 'repository description', query: '  METAL  ' },
    { field: 'repository owner', query: '  RENDER-LABS  ' },
    { field: 'release tag', query: '  V2.0  ' },
  ])('combines a trimmed case-insensitive $field search with the release type', ({ query }) => {
    const releases = [release('stable'), release('preview', { isPrerelease: true })]

    expect(filterReleases(releases, 'stable', query).map((item) => item.id)).toEqual(['stable'])
  })
})
