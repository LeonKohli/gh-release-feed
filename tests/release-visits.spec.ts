import 'fake-indexeddb/auto'
import { deleteDB } from 'idb'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useGithub, useGithubStore, type ReleaseObj } from '../app/composables/useGithub'
import { isNewRelease } from '../app/lib/release-visits'

const initial = Date.parse('2026-10-17T12:00:00Z')
const session = ref({ user: { id: 'visits-a' } })
const scopes: ReturnType<typeof effectScope>[] = []
const clients: ReturnType<typeof useGithub>[] = []

beforeEach(async () => {
  await deleteDB('github-releases-v3-visits-a')
  await deleteDB('github-releases-v3-visits-b')
  setActivePinia(createPinia())
  session.value.user.id = 'visits-a'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(initial)
  vi.stubGlobal('useUserSession', () => ({ loggedIn: ref(true), session }))
  vi.stubGlobal('$fetch', async () => response())
})
afterEach(async () => {
  for (const client of clients) await client.cleanup()
  for (const scope of scopes) scope.stop()
  clients.length = 0
  scopes.length = 0
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
function client() {
  const scope = effectScope()
  scopes.push(scope)
  const result = scope.run(() => useGithub())!
  clients.push(result)
  return result
}
function response(cursor: string | null = null) {
  return {
    viewer: {
      starredRepositories: {
        totalCount: 0,
        edges: [],
        pageInfo: { hasNextPage: !!cursor, endCursor: cursor },
      },
    },
    rateLimit: { cost: 1, remaining: 4999, resetAt: '2026-10-17T13:00:00Z' },
  }
}

it('leaves first visits unreviewed across loading, refresh, and remount until explicit completion', async () => {
  const first = client()
  expect(first.canCompleteVisit.value).toBe(false)
  await first.fetchReleases()
  expect(first.lastReviewedAt.value).toBeNull()
  expect(first.newReleaseIds.value.size).toBe(0)
  expect(first.canCompleteVisit.value).toBe(true)
  await first.fetchReleases(null, { force: true })
  await first.cleanup()
  const returning = client()
  await returning.fetchReleases()
  expect(returning.lastReviewedAt.value).toBeNull()
  await returning.completeVisit()
  expect(returning.lastReviewedAt.value).toBe(initial)
})

it('restores completed visits, uses a strict publication boundary, and keeps refresh freshness separate', async () => {
  const first = client()
  await first.fetchReleases()
  await first.completeVisit()
  await first.cleanup()
  vi.setSystemTime(initial + 60_000)
  const returning = client()
  await returning.fetchReleases()
  useGithubStore().releases = [
    { id: 'older', publishedAt: new Date(initial - 1).toISOString() },
    { id: 'equal', publishedAt: new Date(initial).toISOString() },
    { id: 'newer', publishedAt: new Date(initial + 1).toISOString() },
    { id: 'invalid', publishedAt: 'invalid' },
  ] as ReleaseObj[]
  expect([...returning.newReleaseIds.value]).toEqual(['newer'])
  await returning.fetchReleases(null, { force: true })
  expect(useGithubStore().lastFetchTimestamp).toBe(initial + 60_000)
  expect(returning.lastReviewedAt.value).toBe(initial)
  await returning.completeVisit()
  expect(returning.lastReviewedAt.value).toBe(initial + 60_000)
})

it('uses fetch start rather than completion or click time, including after restoring a cached feed', async () => {
  vi.stubGlobal('$fetch', async () => {
    vi.setSystemTime(initial + 60_000)
    return response()
  })
  const first = client()
  await first.fetchReleases()
  await first.cleanup()
  const restored = client()
  await restored.fetchReleases()
  vi.setSystemTime(initial + 120_000)
  await restored.completeVisit()
  expect(restored.lastReviewedAt.value).toBe(initial)
  expect(isNewRelease(new Date(initial + 1).toISOString(), restored.lastReviewedAt.value)).toBe(
    true,
  )
})

it('cannot complete while pages are loading or after an incomplete refresh', async () => {
  const laterPage = Promise.withResolvers<ReturnType<typeof response>>()
  const started = Promise.withResolvers<void>()
  vi.stubGlobal('$fetch', async (_url: string, options: { params: { cursor: string | null } }) => {
    if (!options.params.cursor) return response('next')
    started.resolve()
    return laterPage.promise
  })
  const feed = client()
  const fetching = feed.fetchReleases()
  await started.promise
  await feed.completeVisit()
  expect(feed.lastReviewedAt.value).toBeNull()
  laterPage.reject(new Error('Offline'))
  await fetching
  expect(feed.canCompleteVisit.value).toBe(false)
  await feed.completeVisit()
  expect(feed.lastReviewedAt.value).toBeNull()
})

it('switches account state without logging out and restores each account independently', async () => {
  const feed = client()
  await feed.fetchReleases()
  await feed.completeVisit()
  session.value.user.id = 'visits-b'
  await nextTick()
  expect(feed.lastReviewedAt.value).toBeNull()
  await feed.fetchReleases()
  vi.setSystemTime(initial + 60_000)
  await feed.fetchReleases(null, { force: true })
  await feed.completeVisit()
  expect(feed.lastReviewedAt.value).toBe(initial + 60_000)
  session.value.user.id = 'visits-a'
  await nextTick()
  await feed.fetchReleases()
  expect(feed.lastReviewedAt.value).toBe(initial)
})

it('keeps visit metadata through cache clearing and never regresses another tab’s completed boundary', async () => {
  const feed = client()
  await feed.fetchReleases()
  const store = useGithubStore()
  await store.db!.put('metadata', { lastReviewedAt: initial + 1 }, 'github-release-feed-visit-v1')
  vi.setSystemTime(initial + 1)
  await feed.completeVisit()
  expect(feed.lastReviewedAt.value).toBe(initial + 1)
  await feed.clearCache()
  expect(feed.lastReviewedAt.value).toBe(initial + 1)
  await feed.cleanup()
  await feed.fetchReleases()
  expect(feed.lastReviewedAt.value).toBe(initial + 1)
})

it('still supports in-memory review when IndexedDB is unavailable and reports the limitation', async () => {
  vi.stubGlobal('indexedDB', undefined)
  const feed = client()
  await feed.fetchReleases()
  expect(feed.visitStorageUnavailable.value).toBe(true)
  await feed.completeVisit()
  expect(feed.lastReviewedAt.value).toBe(initial)
  expect(feed.error.value).toBeNull()
})

it('handles failed writes and malformed stored boundaries without breaking the feed', async () => {
  const feed = client()
  await feed.fetchReleases()
  const store = useGithubStore()
  await store.db!.put('metadata', { lastReviewedAt: Number.NaN }, 'github-release-feed-visit-v1')
  await feed.cleanup()
  await feed.fetchReleases()
  expect(feed.lastReviewedAt.value).toBeNull()
  store.db!.close()
  await feed.completeVisit()
  expect(feed.lastReviewedAt.value).toBe(initial)
  expect(feed.visitStorageUnavailable.value).toBe(true)
})

it('does not apply a pending visit write to a newly selected account', async () => {
  const feed = client()
  await feed.fetchReleases()
  const store = useGithubStore()
  const previousDB = store.db!
  const transaction = previousDB.transaction.bind(previousDB)
  const held = Promise.withResolvers<Awaited<ReturnType<typeof previousDB.get>>>()
  const started = Promise.withResolvers<void>()
  vi.spyOn(previousDB, 'transaction').mockImplementation((...args) => {
    const tx = transaction(...args)
    vi.spyOn(tx.objectStore('metadata'), 'get').mockImplementation(() => {
      started.resolve()
      return held.promise
    })
    return tx
  })
  const completing = feed.completeVisit()
  await started.promise
  session.value.user.id = 'visits-b'
  await nextTick()
  await feed.fetchReleases()
  held.resolve(undefined)
  await completing
  expect(feed.lastReviewedAt.value).toBeNull()
  expect(store.accountId).toBe('visits-b')
})
