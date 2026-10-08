import type { ReleaseObj } from '../app/composables/useGithub'
import type { ReleaseType } from '../app/lib/release-filters'
import { describe, expect, it } from 'vitest'
import { filterReleases, getNoteMatch, getRepositoryOptions } from '../app/lib/release-filters'

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

  it('combines a trimmed case-insensitive version search with the release type', () => {
    const releases = [release('stable'), release('preview', { isPrerelease: true })]
    expect(filterReleases(releases, 'stable', '  V2.0  ').map((item) => item.id)).toEqual([
      'stable',
    ])
  })

  it('keeps title search results unchanged when matching notes arrive', () => {
    const item = release('stable', { descriptionHTML: '' })
    expect(filterReleases([item], 'all', 'security')).toEqual([])
    item.descriptionHTML = '<p>A security fix</p>'
    expect(filterReleases([item], 'all', 'security')).toEqual([])
  })

  it('combines exact repository selection with release type and note search', () => {
    const selected = release('selected', { descriptionHTML: '<p>Security fix</p>' })
    const preview = release('preview', {
      isPrerelease: true,
      descriptionHTML: '<p>Security fix</p>',
    })
    const other = release('other', {
      repo: {
        ...selected.repo,
        id: 'other-repo',
        owner: { ...selected.repo.owner, login: 'someone-else' },
      },
      descriptionHTML: '<p>Security fix</p>',
    })
    expect(
      filterReleases([selected, preview, other], 'stable', 'security', {
        repositoryId: selected.repo.id,
        searchIn: 'notes',
      }).map((item) => item.id),
    ).toEqual(['selected'])
  })

  it('searches only note content when the notes scope is selected', () => {
    expect(filterReleases([release('stable')], 'all', 'v2.0', { searchIn: 'notes' })).toEqual([])
  })

  it('shows a case-insensitive note match with readable context beyond the initial preview', () => {
    const html = `
      <p>This release updates the renderer, improves startup performance, and fixes several
      issues reported by users. The migration guide describes the configuration changes
      and explains how to update existing projects without changing their rendering setup.</p>
      <p>Fixed a <strong>SeCuRiTy</strong> issue in the renderer.</p>
      <p>The remaining changes improve diagnostics and add examples for projects that use
      custom rendering pipelines. See the upgrade guide for the complete list of changes
      and the compatibility notes for older versions.</p>
    `

    const excerpt = getNoteMatch(html, ' SECURITY ')

    expect(excerpt?.match).toBe('SeCuRiTy')
    expect(excerpt?.before).toMatch(/^….*Fixed a $/)
    expect(excerpt?.after).toMatch(/^ issue in the renderer\..*…$/)
    expect(`${excerpt?.before}${excerpt?.match}${excerpt?.after}`).not.toMatch(/<[^>]*>/)
  })

  it('lists repositories once with owner-qualified names and release counts, excluding drafts', () => {
    const first = release('first')
    const second = release('second')
    const fork = release('fork', {
      repo: {
        ...first.repo,
        id: 'fork-id',
        owner: { ...first.repo.owner, login: 'another-owner' },
      },
    })
    const draft = release('draft', { isDraft: true, repo: { ...first.repo, id: 'draft-only' } })
    expect(getRepositoryOptions([first, second, fork, draft])).toEqual([
      {
        id: 'fork-id',
        label: 'another-owner/mcopt',
        description: 'Native Metal renderer',
        count: 1,
      },
      {
        id: 'render-labs/mcopt',
        label: 'render-labs/mcopt',
        description: 'Native Metal renderer',
        count: 2,
      },
    ])
  })
})
