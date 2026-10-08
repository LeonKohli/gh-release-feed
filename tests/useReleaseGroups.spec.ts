import type { ReleaseObj } from '../app/composables/useGithub'
import { afterEach, describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { useReleaseGroups } from '../app/composables/useReleaseGroups'

const scopes: ReturnType<typeof effectScope>[] = []

afterEach(() => {
  for (const scope of scopes) scope.stop()
  scopes.length = 0
})

function grouping() {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useReleaseGroups())!
}

function release(id: string, publishedAt: string, owner = 'vuejs'): ReleaseObj {
  return {
    id,
    publishedAt,
    name: id,
    tagName: id,
    url: `https://github.com/${owner}/core/releases/tag/${id}`,
    descriptionHTML: '',
    isDraft: false,
    isPrerelease: false,
    repo: {
      id: `${owner}/core`,
      name: 'core',
      url: `https://github.com/${owner}/core`,
      stargazerCount: 100,
      owner: {
        login: owner,
        url: `https://github.com/${owner}`,
        avatarUrl: '',
      },
      licenseInfo: null,
      primaryLanguage: null,
      languages: { edges: [] },
    },
  }
}

describe('release grouping', () => {
  it('groups releases at the two-hour boundary and sorts newest first', () => {
    const { groupReleases } = grouping()
    const releases = [
      release('old', '2026-10-08T08:00:00Z'),
      release('new', '2026-10-08T10:00:00Z'),
    ]

    const groups = groupReleases(releases)

    expect(groups.map((group) => group.releases.map((item) => item.id))).toEqual([['new', 'old']])
    expect(groups[0]?.isSingleRelease).toBe(false)
    expect(releases.map((item) => item.id)).toEqual(['old', 'new'])
  })

  it('keeps repositories with different owners separate', () => {
    const { groupReleases } = grouping()

    const groups = groupReleases([
      release('vue-release', '2026-10-08T10:00:00Z', 'vuejs'),
      release('nuxt-release', '2026-10-08T10:00:00Z', 'nuxt'),
    ])

    expect(groups.map((group) => group.repo.owner.login)).toEqual(['nuxt', 'vuejs'])
    expect(groups.map((group) => group.isSingleRelease)).toEqual([true, true])
  })

  it('uses refreshed release notes and repository metadata when IDs and publication dates stay the same', () => {
    const { groupReleases } = grouping()
    const original = {
      ...release('v1', '2026-10-08T10:00:00Z'),
      updatedAt: '2026-10-08T10:00:00Z',
      descriptionHTML: '<p>Original notes</p>',
    }
    groupReleases([original])
    const updated = {
      ...original,
      updatedAt: '2026-10-08T11:00:00Z',
      descriptionHTML: '<p>Corrected notes</p>',
      repo: { ...original.repo, description: 'Updated project description' },
    }

    const groups = groupReleases([updated])

    expect(groups[0]?.releases[0]?.descriptionHTML).toBe('<p>Corrected notes</p>')
    expect(groups[0]?.releases[0]?.repo.description).toBe('Updated project description')
  })

  it('starts a separate group after a three-hour gap', () => {
    const { groupReleases } = grouping()

    const groups = groupReleases([
      release('new', '2026-10-08T10:00:00Z'),
      release('old', '2026-10-08T07:00:00Z'),
    ])

    expect(groups.map((group) => group.releases.map((item) => item.id))).toEqual([['new'], ['old']])
  })
})
