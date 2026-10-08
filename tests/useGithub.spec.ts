import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, ref, watch } from 'vue'
import { useGithub } from '../app/composables/useGithub'

const scopes: ReturnType<typeof effectScope>[] = []
const now = '2026-10-08T12:00:00Z'
const rateLimit = {
  cost: 1,
  limit: 5000,
  remaining: 4999,
  resetAt: '2026-10-08T13:00:00Z',
  used: 1,
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.setSystemTime(new Date(now))
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('useUserSession', () => ({
    loggedIn: ref(true),
    session: ref({ user: { id: 'test-user', accessToken: 'test-token' } }),
    fetch: async () => {},
  }))
})

afterEach(() => {
  for (const scope of scopes) scope.stop()
  scopes.length = 0
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function github() {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useGithub())!
}

function release(id: string, isPrerelease = false) {
  return {
    id,
    name: id,
    tagName: id,
    publishedAt: now,
    updatedAt: now,
    url: `https://github.com/example/project/releases/tag/${id}`,
    descriptionHTML: '<p>Release notes</p>',
    isDraft: false,
    isPrerelease,
  }
}

function repository(releases: ReturnType<typeof release>[], cursor: string | null = null) {
  return {
    id: 'repo-id',
    name: 'project',
    url: 'https://github.com/example/project',
    description: 'A project worth remembering',
    stargazerCount: 382,
    forkCount: 18,
    visibility: 'PUBLIC',
    isArchived: true,
    pushedAt: '2026-10-08T11:15:00Z',
    homepageUrl: 'https://example.com/project',
    owner: { login: 'example', avatarUrl: '', url: 'https://github.com/example' },
    primaryLanguage: { id: 'java-id', name: 'Java', color: '#b07219' },
    languages: { totalCount: 1, edges: [] },
    licenseInfo: null,
    releases: {
      totalCount: releases.length + (cursor ? 1 : 0),
      edges: releases.map((node) => ({ node })),
      pageInfo: { hasNextPage: !!cursor, endCursor: cursor },
    },
  }
}

function starredPage(repositories: ReturnType<typeof repository>[], cursor: string | null = null) {
  return {
    viewer: {
      starredRepositories: {
        totalCount: 2,
        edges: repositories.map((node) => ({ node })),
        pageInfo: { hasNextPage: !!cursor, endCursor: cursor },
      },
    },
    rateLimit,
  }
}

describe('GitHub release fetching', () => {
  it('loads recent stable releases and repository details without separate history requests', async () => {
    const requestedPaths: string[] = []
    vi.stubGlobal('$fetch', async (url: string) => {
      requestedPaths.push(url)
      if (url === '/api/github/releases') {
        return starredPage([
          repository(
            [
              ...Array.from({ length: 8 }, (_, index) => release(`rc-${8 - index}`, true)),
              release('stable-1'),
            ],
            'Mw',
          ),
        ])
      }
      throw new Error(`Unexpected API request: ${url}`)
    })
    const client = github()

    const fetching = client.fetchReleases()
    await vi.runAllTimersAsync()
    await fetching

    expect(client.error.value).toBeNull()
    expect(
      client.releases.value.filter((item) => !item.isPrerelease).map((item) => item.id),
    ).toEqual(['stable-1'])
    expect(client.releases.value.find((item) => item.id === 'stable-1')?.repo).toMatchObject({
      description: 'A project worth remembering',
      forkCount: 18,
      visibility: 'PUBLIC',
      isArchived: true,
      pushedAt: '2026-10-08T11:15:00Z',
      homepageUrl: 'https://example.com/project',
      primaryLanguage: { name: 'Java', color: '#b07219' },
    })
    expect(requestedPaths).toEqual(['/api/github/releases'])
    expect(client.loading.value).toBe(false)
    expect(client.backgroundLoading.value).toBe(false)
  })

  it('continues through an empty starred page with short opaque cursors to a later page', async () => {
    vi.stubGlobal(
      '$fetch',
      async (_url: string, options?: { params?: { cursor?: string | null } }) => {
        const cursor = options?.params?.cursor
        if (!cursor) return starredPage([repository([release('first')])], 'Mw')
        if (cursor === 'Mw') return starredPage([], 'Mg')
        if (cursor === 'Mg') return starredPage([repository([release('later')])])
        throw new Error(`Unexpected cursor: ${cursor}`)
      },
    )
    const client = github()

    const fetching = client.fetchReleases()
    await vi.runAllTimersAsync()
    await fetching

    expect(client.error.value).toBeNull()
    expect(client.releases.value.map((item) => item.id)).toEqual(['first', 'later'])
    expect(client.loading.value).toBe(false)
    expect(client.backgroundLoading.value).toBe(false)
  })

  it('includes the latest stable release when the recent release page contains only prereleases', async () => {
    const repo = {
      ...repository([
        release('canary-3', true),
        release('canary-2', true),
        release('canary-1', true),
      ]),
      latestRelease: { ...release('latest-stable'), publishedAt: '2026-09-01T08:00:00Z' },
    }
    vi.stubGlobal('$fetch', async () => starredPage([repo]))
    const client = github()

    const fetching = client.fetchReleases()
    await vi.runAllTimersAsync()
    await fetching

    expect(client.error.value).toBeNull()
    expect(
      client.releases.value.filter((item) => !item.isPrerelease).map((item) => item.id),
    ).toEqual(['latest-stable'])
  })
})
