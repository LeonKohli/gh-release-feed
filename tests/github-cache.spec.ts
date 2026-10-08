import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { computed, effectScope, ref, watch } from 'vue'
import { useGithub } from '../app/composables/useGithub'

const clients: ReturnType<typeof useGithub>[] = []
const scopes: ReturnType<typeof effectScope>[] = []

afterEach(async () => {
  for (const client of clients) await client.cleanup()
  for (const scope of scopes) scope.stop()
  clients.length = 0
  scopes.length = 0
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

it('restores separately fetched release notes from a fresh cache while offline', async () => {
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('useUserSession', () => ({
    loggedIn: ref(true),
    session: ref({ user: { id: 'test-user', accessToken: 'test-token' } }),
    fetch: async () => {},
  }))
  const publishedAt = new Date().toISOString()
  const notes = '<h2>What changed</h2><p>Rendering is faster.</p>'
  let offline = false
  vi.stubGlobal('$fetch', async (url: string) => {
    if (offline) throw new Error('Network offline')
    if (url === '/api/github/release-details') {
      return { items: [{ id: 'release-1', descriptionHTML: notes }] }
    }
    if (url !== '/api/github/releases') throw new Error(`Unexpected API request: ${url}`)
    return {
      viewer: {
        starredRepositories: {
          totalCount: 1,
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: [
            {
              node: {
                id: 'repo-1',
                name: 'project',
                url: 'https://github.com/example/project',
                description: 'A useful project',
                stargazerCount: 100,
                owner: { login: 'example', url: 'https://github.com/example', avatarUrl: '' },
                primaryLanguage: null,
                languages: { totalCount: 0, edges: [] },
                licenseInfo: null,
                releases: {
                  totalCount: 1,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  edges: [
                    {
                      node: {
                        id: 'release-1',
                        name: 'Version 1',
                        tagName: 'v1',
                        publishedAt,
                        updatedAt: publishedAt,
                        url: 'https://github.com/example/project/releases/tag/v1',
                        descriptionHTML: '',
                        isDraft: false,
                        isPrerelease: false,
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
      rateLimit: {
        cost: 1,
        limit: 5000,
        remaining: 4999,
        resetAt: publishedAt,
        used: 1,
      },
    }
  })
  const firstVisit = newClient()
  await firstVisit.fetchReleases()
  await firstVisit.ensureDescriptions(['release-1'])
  expect(firstVisit.releases.value[0]?.descriptionHTML).toBe(notes)
  await firstVisit.cleanup()
  offline = true

  const nextVisit = newClient()
  await nextVisit.fetchReleases()

  expect(nextVisit.error.value).toBeNull()
  expect(nextVisit.releases.value[0]?.descriptionHTML).toBe(notes)
})
