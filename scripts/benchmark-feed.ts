import { createPinia, setActivePinia } from 'pinia'
import { computed, watch, ref, effectScope } from 'vue'
import { useGithub, useGithubStore } from '../app/composables/useGithub'
Object.assign(globalThis, {
  computed,
  watch,
  useUserSession: () => ({
    loggedIn: ref(true),
    session: ref({ user: { id: 'test-user', accessToken: 'fixture' } }),
    fetch: async () => {},
  }),
})
const latencyMs = 100
const releasesPerRepository = Number(process.env.BENCHMARK_RELEASE_COUNT || '9')
if (![3, 9].includes(releasesPerRepository)) {
  throw new Error('BENCHMARK_RELEASE_COUNT must be 3 (baseline) or 9 (current query).')
}
const now = new Date().toISOString()
const rateLimit = { cost: 1, limit: 5000, remaining: 4999, resetAt: now, used: 1 }
const release = (repo: string, i: number) => ({
  id: `${repo}-release-${i}`,
  name: `${repo}-release-${i}`,
  tagName: `v${i}`,
  publishedAt: now,
  updatedAt: now,
  descriptionHTML: '<p>Notes</p>',
  url: 'https://github.com/a/p/releases/tag/v1',
  isDraft: false,
  isPrerelease: false,
})
const repository = (id: string, offset: number, count: number, nextCursor: string | null) => ({
  id,
  name: id,
  url: 'https://github.com/a/p',
  description: 'p',
  stargazerCount: 1,
  owner: { login: 'a', url: 'https://github.com/a', avatarUrl: '' },
  primaryLanguage: null,
  languages: { totalCount: 0, edges: [] },
  licenseInfo: null,
  releases: {
    totalCount: 30,
    edges: Array.from({ length: count }, (_, i) => ({ node: release(id, offset + i) })),
    pageInfo: { hasNextPage: nextCursor !== null, endCursor: nextCursor },
  },
})
let requests = 0
let firstFeedMs: number | null = null
let nextStarredPageMs: number | null = null
const start = performance.now()
Object.assign(globalThis, {
  $fetch: async (
    url: string,
    options: { params?: { cursor?: string }; body?: { repoId?: string; cursor?: string } },
  ) => {
    requests++
    await new Promise((resolve) => setTimeout(resolve, latencyMs))
    if (url === '/api/github/repo-releases') {
      const cursor = options.body!.cursor!
      return {
        repository: repository(
          options.body!.repoId!,
          cursor === '3' ? 3 : 6,
          3,
          cursor === '3' ? '6' : '9',
        ),
        rateLimit,
      }
    }
    const second = !!options.params?.cursor
    if (second) nextStarredPageMs = performance.now() - start
    const count = releasesPerRepository
    return {
      viewer: {
        starredRepositories: {
          totalCount: 21,
          pageInfo: { hasNextPage: !second, endCursor: second ? null : 'starred-page-2' },
          edges: (second
            ? [repository('repo-20', 0, 3, null)]
            : Array.from({ length: 20 }, (_, i) => repository(`repo-${i}`, 0, count, String(count)))
          ).map((node) => ({ node })),
        },
      },
      rateLimit,
    }
  },
})
setActivePinia(createPinia())
const scope = effectScope()
const client = scope.run(() => useGithub())!
useGithubStore().initDB = async () => {}
const stop = watch(client.releases, (value) => {
  if (value.length && firstFeedMs === null) firstFeedMs = performance.now() - start
})
await client.fetchReleases()
console.log(
  JSON.stringify({
    latencyMs,
    busyRepositories: 20,
    starredPages: 2,
    requests,
    releases: client.releases.value.length,
    firstFeedMs: Math.round(firstFeedMs || 0),
    nextStarredPageMs: Math.round(nextStarredPageMs || 0),
    totalMs: Math.round(performance.now() - start),
  }),
)
stop()
await client.cleanup()
scope.stop()
