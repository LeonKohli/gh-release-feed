import 'fake-indexeddb/auto'
import { deleteDB } from 'idb'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, ref, watch } from 'vue'
import { useGithub, useGithubStore, type ReleaseObj } from '../app/composables/useGithub'

const clients: ReturnType<typeof useGithub>[] = []
const scopes: ReturnType<typeof effectScope>[] = []
const publishedAt = new Date().toISOString()
const rateLimit = {
  cost: 1,
  limit: 5000,
  remaining: 4999,
  resetAt: publishedAt,
  used: 1,
}

beforeEach(async () => {
  await deleteDB('github-releases')
  await deleteDB('github-releases-v3-test-user')
  await deleteDB('github-releases-v3-other-user')
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('useUserSession', () => ({
    loggedIn: ref(true),
    session: ref({ user: { id: 'test-user', accessToken: 'test-token' } }),
    fetch: async () => {},
  }))
})

afterEach(async () => {
  for (const client of clients) await client.cleanup()
  for (const scope of scopes) scope.stop()
  clients.length = 0
  scopes.length = 0
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function newClient() {
  setActivePinia(createPinia())
  const scope = effectScope()
  scopes.push(scope)
  const client = scope.run(() => useGithub())!
  clients.push(client)
  return client
}

function release(id: string, descriptionHTML = ''): ReleaseObj {
  return {
    id,
    name: id,
    tagName: id,
    url: `https://github.com/example/project/releases/tag/${id}`,
    publishedAt,
    descriptionHTML,
    isDraft: false,
    isPrerelease: false,
    repo: {
      id: 'repo-1',
      name: 'project',
      url: 'https://github.com/example/project',
      stargazerCount: 100,
      owner: { login: 'example', url: 'https://github.com/example', avatarUrl: '' },
      primaryLanguage: null,
      languages: { edges: [] },
      licenseInfo: null,
    },
  }
}

function starredPage(releases: Array<ReleaseObj & { updatedAt?: string }>) {
  return {
    viewer: {
      starredRepositories: {
        totalCount: 1,
        pageInfo: { hasNextPage: false, endCursor: null },
        edges: [
          {
            node: {
              ...release('unused').repo,
              description: 'A useful project',
              languages: { totalCount: 0, edges: [] },
              releases: {
                totalCount: releases.length,
                pageInfo: { hasNextPage: false, endCursor: null },
                edges: releases.map((node) => ({
                  node: { ...node, updatedAt: node.updatedAt || publishedAt },
                })),
              },
            },
          },
        ],
      },
    },
    rateLimit,
  }
}

describe('GitHub feed refresh and demand-loaded notes', () => {
  it.each([false, true])(
    'keeps the cached feed when refresh fails (forced: %s)',
    async (force) => {
      let fail = false
      vi.stubGlobal('$fetch', async () => {
        if (fail) throw { statusCode: 401, message: 'Not authenticated' }
        return starredPage([release('cached-release', '<p>Useful cached notes</p>')])
      })
      const firstVisit = newClient()
      await firstVisit.fetchReleases()
      await useGithubStore().db!.put(
        'metadata',
        { lastFetchTimestamp: Date.now() - 10 * 60 * 1000 },
        'github-releases-metadata-v2',
      )
      await firstVisit.cleanup()
      fail = true
      const nextVisit = newClient()

      await nextVisit.fetchReleases(null, { force })

      expect(nextVisit.releases.value.map((item) => item.id)).toEqual(['cached-release'])
      expect(nextVisit.releases.value[0]?.descriptionHTML).toBe('<p>Useful cached notes</p>')
      expect(nextVisit.error.value).toBeTruthy()
    },
    15_000,
  )

  it('respects GitHub Retry-After before another forced refresh can contact the API', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const startedAt = Date.now()
    let quotaAvailable = false
    const fetch = vi.fn(async () => {
      if (!quotaAvailable) {
        throw {
          statusCode: 429,
          data: {
            statusCode: 429,
            message: 'Quota',
            data: { retryAfter: 60, resetAt: null },
          },
        }
      }
      return starredPage([release('after-reset', '<p>Notes</p>')])
    })
    vi.stubGlobal('$fetch', fetch)
    const client = newClient()
    try {
      await client.fetchReleases()
      await client.fetchReleases(null, { force: true })
      expect(fetch).toHaveBeenCalledTimes(1)
      quotaAvailable = true
      vi.setSystemTime(startedAt + 61_000)

      await client.fetchReleases(null, { force: true })

      expect(client.releases.value.map((item) => item.id)).toEqual(['after-reset'])
      expect(fetch).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('replaces the persisted feed after a complete successful refresh', async () => {
    let refreshed = false
    vi.stubGlobal('$fetch', async () =>
      starredPage(
        refreshed
          ? [release('new-release', '<p>New notes</p>')]
          : [release('removed-release', '<p>Old notes</p>')],
      ),
    )
    const client = newClient()
    await client.fetchReleases()
    refreshed = true

    await client.fetchReleases(null, { force: true })
    await client.cleanup()
    const nextVisit = newClient()
    await nextVisit.fetchReleases()

    expect(nextVisit.releases.value.map((item) => item.id)).toEqual(['new-release'])
  })

  it('isolates the cached feed between GitHub accounts', async () => {
    let secondAccount = false
    vi.stubGlobal('$fetch', async () =>
      starredPage([
        release(secondAccount ? 'second-account-release' : 'first-account-release', '<p>Notes</p>'),
      ]),
    )
    const firstVisit = newClient()
    await firstVisit.fetchReleases()
    await firstVisit.cleanup()
    secondAccount = true
    vi.stubGlobal('useUserSession', () => ({
      loggedIn: ref(true),
      session: ref({ user: { id: 'other-user', accessToken: 'test-token' } }),
      fetch: async () => {},
    }))
    const nextAccount = newClient()

    await nextAccount.fetchReleases()

    expect(nextAccount.releases.value.map((item) => item.id)).toEqual(['second-account-release'])
  })

  it('loads requested notes beyond the first twenty in valid batches without duplicating concurrent IDs', async () => {
    const client = newClient()
    const records = Array.from({ length: 56 }, (_, index) => release(`release-${index}`))
    useGithubStore().releases = records
    const batches: string[][] = []
    vi.stubGlobal('$fetch', async (_url: string, options: { body: { ids: string[] } }) => {
      batches.push(options.body.ids)
      return {
        items: options.body.ids.map((id) => ({ id, descriptionHTML: `<p>Notes for ${id}</p>` })),
        rateLimit,
      }
    })

    await Promise.all([
      client.ensureDescriptions(records.slice(0, 55).map((item) => item.id)),
      client.ensureDescriptions(records.slice(20).map((item) => item.id)),
    ])

    expect(client.releases.value.at(-1)?.descriptionHTML).toBe('<p>Notes for release-55</p>')
    expect(batches.every((ids) => ids.length <= 50)).toBe(true)
    expect(batches.flat().sort()).toEqual(records.map((item) => item.id).sort())
  })

  it('does not request a successfully loaded empty description again', async () => {
    const client = newClient()
    useGithubStore().releases = [release('empty-notes')]
    const fetch = vi.fn(async () => ({
      items: [{ id: 'empty-notes', descriptionHTML: '' }],
      rateLimit,
    }))
    vi.stubGlobal('$fetch', fetch)

    await client.ensureDescriptions(['empty-notes'])
    await client.ensureDescriptions(['empty-notes'])

    expect(client.releases.value[0]?.descriptionLoaded).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('shows fetched notes when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const client = newClient()
    useGithubStore().releases = [release('memory-only')]
    vi.stubGlobal('$fetch', async () => ({
      items: [{ id: 'memory-only', descriptionHTML: '<p>Available without storage</p>' }],
      rateLimit,
    }))

    await client.ensureDescriptions(['memory-only'])

    expect(useGithubStore().db).toBeNull()
    expect(client.releases.value[0]?.descriptionHTML).toBe('<p>Available without storage</p>')
  })

  it('starts a fresh feed and notes after account cleanup while old requests are still pending', async () => {
    const session = ref({ user: { id: 'test-user', accessToken: 'test-token' } })
    vi.stubGlobal('useUserSession', () => ({ loggedIn: ref(true), session }))
    const oldFeed = Promise.withResolvers<ReturnType<typeof starredPage>>()
    const oldNotes = Promise.withResolvers<{
      items: Array<{ id: string; descriptionHTML: string }>
      rateLimit: typeof rateLimit
    }>()
    const oldFeedStarted = Promise.withResolvers<void>()
    const oldNotesStarted = Promise.withResolvers<void>()
    let feedRequests = 0
    let notesRequests = 0
    vi.stubGlobal('$fetch', async (url: string) => {
      if (url === '/api/github/release-details') {
        notesRequests++
        if (notesRequests === 1) {
          oldNotesStarted.resolve()
          return oldNotes.promise
        }
        return {
          items: [{ id: 'shared-release', descriptionHTML: '<p>Current notes</p>' }],
          rateLimit,
        }
      }
      feedRequests++
      if (feedRequests === 2) {
        oldFeedStarted.resolve()
        return oldFeed.promise
      }
      return starredPage([
        {
          ...release('shared-release'),
          name: feedRequests === 1 ? 'Initial release' : 'Current release',
        },
      ])
    })
    const client = newClient()
    await client.fetchReleases()
    const obsoleteNotesTask = client.ensureDescriptions(['shared-release'])
    const obsoleteFeedTask = client.fetchReleases(null, { force: true })
    await Promise.all([oldFeedStarted.promise, oldNotesStarted.promise])
    await client.cleanup()
    session.value.user.id = 'other-user'
    await nextTick()

    const currentFeedTask = client.fetchReleases()
    await vi.waitFor(() => expect(client.releases.value[0]?.name).toBe('Current release'))
    await currentFeedTask
    const currentNotesTask = client.ensureDescriptions(['shared-release'])
    await vi.waitFor(() =>
      expect(client.releases.value[0]?.descriptionHTML).toBe('<p>Current notes</p>'),
    )
    await currentNotesTask
    oldFeed.resolve(starredPage([{ ...release('shared-release'), name: 'Obsolete release' }]))
    oldNotes.resolve({
      items: [{ id: 'shared-release', descriptionHTML: '<p>Obsolete notes</p>' }],
      rateLimit,
    })
    await Promise.all([obsoleteFeedTask, obsoleteNotesTask])

    expect(client.releases.value[0]?.name).toBe('Current release')
    expect(client.releases.value[0]?.descriptionHTML).toBe('<p>Current notes</p>')
    expect(client.error.value).toBeNull()
    expect(client.descriptionErrors.value['shared-release']).toBeUndefined()
  })

  it('ignores a late notes response for a version replaced by a refresh', async () => {
    let edited = false
    const oldRequest = Promise.withResolvers<{
      items: Array<{ id: string; descriptionHTML: string }>
      rateLimit: typeof rateLimit
    }>()
    const detailsStarted = Promise.withResolvers<void>()
    vi.stubGlobal('$fetch', async (url: string) => {
      if (url === '/api/github/release-details') {
        detailsStarted.resolve()
        return oldRequest.promise
      }
      return starredPage([
        {
          ...release('edited-release'),
          updatedAt: edited ? new Date(Date.now() + 60_000).toISOString() : publishedAt,
        },
      ])
    })
    const client = newClient()
    await client.fetchReleases()
    const loadingNotes = client.ensureDescriptions(['edited-release'])
    await detailsStarted.promise
    edited = true
    await client.fetchReleases(null, { force: true })

    oldRequest.resolve({
      items: [{ id: 'edited-release', descriptionHTML: '<p>Outdated notes</p>' }],
      rateLimit,
    })
    await loadingNotes

    expect(client.releases.value[0]?.descriptionHTML).toBe('')
    expect(client.releases.value[0]?.descriptionLoaded).toBe(false)
    expect(client.descriptionErrors.value['edited-release']).toBeUndefined()
  })

  it('refreshes cached notes after GitHub changes updatedAt without changing publishedAt', async () => {
    let edited = false
    vi.stubGlobal('$fetch', async (url: string) => {
      if (url === '/api/github/release-details') {
        return {
          items: [{ id: 'edited-release', descriptionHTML: '<p>Corrected notes</p>' }],
          rateLimit,
        }
      }
      return starredPage([
        {
          ...release('edited-release', edited ? '' : '<p>Original notes</p>'),
          updatedAt: edited ? new Date(Date.now() + 60_000).toISOString() : publishedAt,
        },
      ])
    })
    const client = newClient()
    await client.fetchReleases()
    edited = true

    await client.fetchReleases(null, { force: true })
    await client.ensureDescriptions(['edited-release'])

    expect(client.releases.value[0]?.descriptionHTML).toBe('<p>Corrected notes</p>')
  })
})
