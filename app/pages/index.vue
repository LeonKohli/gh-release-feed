<script setup lang="ts">
import {
  useStorage,
  useElementVisibility,
  useDebounceFn,
  refDebounced,
  watchDebounced,
} from '@vueuse/core'
import { filterReleases, isReleaseType } from '~/lib/release-filters'

const { loggedIn, clear, ready } = useUserSession()
const {
  releases,
  loading,
  backgroundLoading,
  error,
  reposProcessed,
  rateLimitRemaining,
  rateLimitResetAt,
  retries,
  fetchReleases,
  clearCache,
} = useGithub()
const { groupReleases } = useReleaseGroups()
const page = ref(1)
const perPage = 20
const searchQuery = ref('')
const debouncedSearchQuery = refDebounced(searchQuery, 200)
const isSearching = computed(() => searchQuery.value !== debouncedSearchQuery.value)
const savedType = useStorage('release-feed-type', 'all', undefined, { initOnMounted: true })
const releaseType = computed({
  get: () => (isReleaseType(savedType.value) ? savedType.value : 'all'),
  set: (value) => {
    savedType.value = value
  },
})
const filteredReleases = computed(() =>
  filterReleases(releases.value, releaseType.value, debouncedSearchQuery.value),
)
const releaseGroups = computed(() => groupReleases(filteredReleases.value))
const visibleReleaseGroups = computed(() => releaseGroups.value.slice(0, page.value * perPage))
const hasMoreReleases = computed(
  () => visibleReleaseGroups.value.length < releaseGroups.value.length,
)
const isLoadingAny = computed(() => loading.value || backgroundLoading.value)
const hasFilters = computed(() => !!searchQuery.value || releaseType.value !== 'all')
const projectCount = computed(
  () => new Set(filteredReleases.value.map((release) => release.repo.id)).size,
)
const loadingState = computed(() => (isLoadingAny.value ? 'Loading releases' : 'Refresh releases'))
watch([debouncedSearchQuery, releaseType], () => {
  page.value = 1
})
const loadMoreTrigger = ref<HTMLElement | null>(null)
const isLoadMoreVisible = useElementVisibility(loadMoreTrigger)
watchDebounced(
  isLoadMoreVisible,
  (visible) => {
    if (visible && !isLoadingAny.value && hasMoreReleases.value) page.value++
  },
  { debounce: 100 },
)
function resetFilters() {
  searchQuery.value = ''
  releaseType.value = 'all'
}
const handleRefresh = useDebounceFn(async () => {
  if (isLoadingAny.value) return
  page.value = 1
  await clearCache()
  await fetchReleases()
}, 300)
watch(
  [ready, loggedIn],
  async ([sessionReady, signedIn]) => {
    if (sessionReady && signedIn) await fetchReleases()
  },
  { immediate: true },
)
async function handleLogout() {
  await clear()
  await navigateTo('/login')
}
useHead({
  title: 'GitHub Release Feed',
  meta: [{ name: 'description', content: 'Track releases from your starred GitHub repositories' }],
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <div class="mx-auto max-w-4xl px-4 sm:px-6">
      <AppNavbar
        v-model:search-query="searchQuery"
        :is-searching="isSearching"
        :is-loading-any="isLoadingAny"
        :loading-state="loadingState"
        :repos-processed="reposProcessed"
        :rate-limit-remaining="rateLimitRemaining"
        :rate-limit-reset-at="rateLimitResetAt"
        :retries="retries"
        @refresh="handleRefresh"
        @logout="handleLogout"
      />
      <main class="flex flex-col gap-5 pb-10">
        <Card v-if="!loggedIn" class="my-8">
          <CardHeader>
            <CardTitle>Releases from the projects you follow</CardTitle>
            <CardDescription
              >Browse releases from your starred GitHub repositories in one place.</CardDescription
            >
          </CardHeader>
          <CardContent
            ><Button as-child
              ><NuxtLink to="/login"
                ><Icon name="lucide:github" data-icon="inline-start" /> Sign in with
                GitHub</NuxtLink
              ></Button
            ></CardContent
          >
        </Card>
        <template v-else>
          <div class="flex flex-col gap-3 pt-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <ReleaseFilters v-model="releaseType" class="w-auto" />
              <Button v-if="hasFilters" variant="ghost" size="sm" @click="resetFilters"
                >Reset filters</Button
              >
            </div>
            <div
              class="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground"
            >
              <p role="status" aria-live="polite" aria-atomic="true">
                {{
                  isLoadingAny
                    ? 'Loading release history…'
                    : `${filteredReleases.length} ${filteredReleases.length === 1 ? 'release' : 'releases'} from ${projectCount} ${projectCount === 1 ? 'project' : 'projects'}`
                }}
              </p>
              <p
                title="Recent releases from each repository and its latest stable release, published within the past three months. Full histories are available on GitHub."
              >
                Last 3 months · recent releases
              </p>
            </div>
            <p v-if="searchQuery" class="text-sm text-muted-foreground">
              Search: <span class="font-medium break-words text-foreground">{{ searchQuery }}</span>
            </p>
          </div>
          <Alert v-if="error" variant="destructive">
            <Icon name="lucide:circle-alert" />
            <AlertTitle>Could not load all releases</AlertTitle>
            <AlertDescription class="flex flex-col gap-2 break-words"
              ><p>{{ error }}</p>
              <Button
                v-if="!isLoadingAny"
                variant="outline"
                size="sm"
                class="self-start"
                @click="handleRefresh"
                >Try again</Button
              ></AlertDescription
            >
          </Alert>
          <div
            v-if="isLoadingAny && !visibleReleaseGroups.length"
            class="flex flex-col gap-4"
            aria-label="Loading releases"
            aria-busy="true"
          >
            <Card v-for="n in 3" :key="n">
              <CardHeader><Skeleton class="h-5 w-1/3" /><Skeleton class="h-3 w-1/4" /></CardHeader>
              <CardContent class="flex flex-col gap-3"
                ><Skeleton class="h-6 w-1/2" /><Skeleton class="h-20 w-full"
              /></CardContent>
            </Card>
          </div>
          <div
            v-else-if="visibleReleaseGroups.length"
            class="flex flex-col gap-4"
            :aria-busy="isLoadingAny"
          >
            <ReleaseCard
              v-for="group in visibleReleaseGroups"
              :key="group.id"
              :releases="group.releases"
            />
          </div>
          <Empty v-else-if="!error">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Icon name="lucide:search" /></EmptyMedia>
              <EmptyTitle>{{
                hasFilters ? 'No matching releases' : 'No recent releases'
              }}</EmptyTitle>
              <EmptyDescription>{{
                hasFilters
                  ? 'Try another search or release type.'
                  : 'Your starred projects have no releases in the current three-month window. Star more projects or check their full release histories on GitHub.'
              }}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent
              ><Button v-if="hasFilters" variant="outline" @click="resetFilters"
                >Reset filters</Button
              ><Button v-else variant="outline" as-child
                ><a href="https://github.com/stars" target="_blank" rel="noopener noreferrer"
                  >View starred repositories</a
                ></Button
              ></EmptyContent
            >
          </Empty>
          <div v-if="hasMoreReleases" ref="loadMoreTrigger" class="flex justify-center py-4">
            <Button variant="outline" @click="page++">Load more</Button>
          </div>
        </template>
      </main>
    </div>
  </div>
</template>
