import * as h3 from 'h3'
import type * as GithubUtils from '../server/utils/github'
import { useStorage } from 'nitropack/runtime/internal/storage'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { graphql } = vi.hoisted(() => ({ graphql: vi.fn() }))
vi.mock('../server/utils/github', async (importOriginal) => ({
  ...(await importOriginal<typeof GithubUtils>()),
  createGithubClient: () => ({ graphql }),
}))
vi.mock('nitropack/runtime/internal/storage', async () => {
  const { createStorage } = await import('unstorage')
  const storage = createStorage()
  return { useStorage: () => storage }
})

const rateLimit = {
  cost: 2,
  limit: 5000,
  remaining: 4998,
  resetAt: '2026-10-08T18:00:00Z',
  used: 2,
}
let request: ReturnType<typeof h3.toWebHandler>

beforeAll(async () => {
  for (const name of [
    'defineEventHandler',
    'getQuery',
    'readBody',
    'createError',
    'setResponseHeader',
  ] as const) {
    vi.stubGlobal(name, h3[name])
  }
  vi.stubGlobal('getUserSession', async () => ({
    user: { id: 'cache-test-user', accessToken: 'test-token' },
  }))
  const releases = (await import('../server/api/github/releases.get')).default
  const details = (await import('../server/api/github/release-details.post')).default
  const app = h3.createApp()
  app.use('/releases', releases)
  app.use('/details', details)
  request = h3.toWebHandler(app)
})

beforeEach(async () => {
  graphql.mockReset()
  await useStorage('cache').clear()
})

afterAll(() => vi.unstubAllGlobals())

describe('GitHub API caching', () => {
  it('fetches the current feed when an explicit refresh bypasses a cached response', async () => {
    const feed = (id: string) => ({
      viewer: {
        starredRepositories: {
          totalCount: 1,
          edges: [{ node: { id } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
      rateLimit,
    })
    graphql
      .mockResolvedValueOnce(feed('before-refresh'))
      .mockResolvedValueOnce(feed('after-refresh'))

    await request(new Request('http://localhost/releases'))
    const refreshed = await request(new Request('http://localhost/releases?refresh=true'))
    const cached = await request(new Request('http://localhost/releases'))

    expect((await refreshed.json()).viewer.starredRepositories.edges[0].node.id).toBe(
      'after-refresh',
    )
    expect((await cached.json()).viewer.starredRepositories.edges[0].node.id).toBe('after-refresh')
    expect(graphql).toHaveBeenCalledTimes(2)
  })

  it('fetches edited notes instead of reusing a cached earlier release version', async () => {
    const originalVersion = '2026-10-08T10:00:00Z'
    const editedVersion = '2026-10-08T11:00:00Z'
    graphql
      .mockResolvedValueOnce({
        nodes: [
          {
            id: 'release-edited',
            descriptionHTML: '<p>Original notes</p>',
            updatedAt: originalVersion,
          },
        ],
        rateLimit,
      })
      .mockResolvedValueOnce({
        nodes: [
          {
            id: 'release-edited',
            descriptionHTML: '<p>Corrected notes</p>',
            updatedAt: editedVersion,
          },
        ],
        rateLimit,
      })
    const fetchVersion = (version: string) =>
      request(
        new Request('http://localhost/details', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ids: ['release-edited'],
            versions: { 'release-edited': version },
          }),
        }),
      )

    await fetchVersion(originalVersion)
    const edited = await fetchVersion(editedVersion)
    const cached = await fetchVersion(editedVersion)

    expect((await edited.json()).items).toEqual([
      { id: 'release-edited', descriptionHTML: '<p>Corrected notes</p>', updatedAt: editedVersion },
    ])
    expect((await cached.json()).items[0].descriptionHTML).toBe('<p>Corrected notes</p>')
    expect(graphql).toHaveBeenCalledTimes(2)
  })

  it.each([{ extra: '2026-10-08T10:00:00Z' }, { 'release-edited': 'invalid-date' }])(
    'rejects invalid release versions without contacting GitHub',
    async (versions) => {
      const response = await request(
        new Request('http://localhost/details', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids: ['release-edited'], versions }),
        }),
      )

      expect(response.status).toBe(400)
      expect(graphql).not.toHaveBeenCalled()
    },
  )

  it('returns cached empty release notes without consuming GitHub quota again', async () => {
    graphql.mockResolvedValue({ nodes: [{ id: 'release-empty', descriptionHTML: '' }], rateLimit })
    const body = JSON.stringify({ ids: ['release-empty', 'release-empty'] })
    const fetchDetails = () =>
      request(
        new Request('http://localhost/details', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        }),
      )

    await fetchDetails()
    const cached = await fetchDetails()

    expect(await cached.json()).toEqual({
      items: [{ id: 'release-empty', descriptionHTML: '' }],
      rateLimit: null,
    })
    expect(cached.headers.get('x-gh-ratelimit-cost')).toBe('0')
    expect(cached.headers.get('cache-control')).toBe('private, no-store')
    expect(graphql).toHaveBeenCalledTimes(1)
    expect(graphql.mock.calls[0]?.[1]).toEqual({ ids: ['release-empty'] })
  })

  it('counts no additional API points when the feed comes from cache', async () => {
    graphql.mockResolvedValue({
      viewer: {
        starredRepositories: {
          totalCount: 0,
          edges: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
      rateLimit,
    })

    const initial = await request(new Request('http://localhost/releases'))
    const cached = await request(new Request('http://localhost/releases'))

    expect((await initial.json()).rateLimit.cost).toBe(2)
    expect((await cached.json()).rateLimit.cost).toBe(0)
    expect(cached.headers.get('x-gh-ratelimit-cost')).toBe('0')
    expect(cached.headers.get('x-cache-status')).toBe('HIT')
    expect(cached.headers.get('cache-control')).toBe('private, no-store')
    expect(graphql).toHaveBeenCalledTimes(1)
  })

  it.each(['NaN', 'Infinity'])(
    'rejects non-finite pageSize %s before contacting GitHub',
    async (pageSize) => {
      const response = await request(new Request(`http://localhost/releases?pageSize=${pageSize}`))

      expect(response.status).toBe(400)
      expect(graphql).not.toHaveBeenCalled()
    },
  )
})
