<script setup lang="ts">
import {
  useStorage,
  useElementVisibility,
  useDebounceFn,
  refDebounced,
  watchDebounced,
  useNow,
  useIntervalFn,
} from '@vueuse/core'
import {
  filterReleases,
  getRepositoryOptions,
  isReleaseType,
  type SearchScope,
} from '~/lib/release-filters'

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
  retryAt,
  reposTotal,
  descriptionErrors,
  ensureDescriptions,
  fetchReleases,
} = useGithub()
const { groupReleases } = useReleaseGroups()
const now = useNow({ scheduler: (callback) => useIntervalFn(callback, 1000) })
const retryDisabled = computed(() => !!retryAt.value && retryAt.value > now.value.getTime())
const page = ref(1)
const perPage = 20
const selectedRepository = ref<string | null>(null)
const searchScope = ref<SearchScope>('titles')
const repositoryOptions = computed(() => getRepositoryOptions(releases.value))
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
  filterReleases(releases.value, releaseType.value, debouncedSearchQuery.value, {
    repositoryId: selectedRepository.value,
    searchIn: searchScope.value,
  }),
)
const searchableReleases = computed(() =>
  filterReleases(releases.value, releaseType.value, '', { repositoryId: selectedRepository.value }),
)
const missingNotesCount = computed(
  () => searchableReleases.value.filter((release) => !release.descriptionLoaded).length,
)
const searchingNotes = ref(false)
async function searchAllNotes() {
  searchingNotes.value = true
  try {
    await ensureDescriptions(searchableReleases.value.map((release) => release.id))
  } finally {
    searchingNotes.value = false
  }
}
watch([debouncedSearchQuery, searchScope, searchableReleases], () => {
  if (searchScope.value === 'notes' && debouncedSearchQuery.value.trim()) void searchAllNotes()
})
const releaseGroups = computed(() => groupReleases(filteredReleases.value))
const visibleReleaseGroups = computed(() => releaseGroups.value.slice(0, page.value * perPage))
const hasMoreReleases = computed(
  () => visibleReleaseGroups.value.length < releaseGroups.value.length,
)
const isLoadingAny = computed(() => loading.value || backgroundLoading.value)
const hasFilters = computed(
  () => !!searchQuery.value || !!selectedRepository.value || releaseType.value !== 'all',
)
const projectCount = computed(
  () => new Set(filteredReleases.value.map((release) => release.repo.id)).size,
)
const loadingState = computed(() => (isLoadingAny.value ? 'Loading releases' : 'Refresh releases'))
watch([debouncedSearchQuery, releaseType, selectedRepository, searchScope], () => {
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
  selectedRepository.value = null
  searchScope.value = 'titles'
  releaseType.value = 'all'
}
const handleRefresh = useDebounceFn(async () => {
  if (isLoadingAny.value || retryDisabled.value) return
  page.value = 1
  await fetchReleases(null, { force: true })
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
        :is-loading-any="isLoadingAny"
        :loading-state="loadingState"
        :repos-processed="reposProcessed"
        :rate-limit-remaining="rateLimitRemaining"
        :rate-limit-reset-at="rateLimitResetAt"
        :retries="retries"
        :retry-disabled="retryDisabled"
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
          <div class="flex flex-col gap-4 pt-3">
            <FieldGroup class="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel for="repository-filter">Repository</FieldLabel>
                <RepositoryFilter v-model="selectedRepository" :repositories="repositoryOptions" />
                <FieldDescription
                  >Projects with releases in the last three months.</FieldDescription
                >
              </Field>
              <Field>
                <FieldLabel for="release-search">{{
                  searchScope === 'notes' ? 'Search release notes' : 'Find a release'
                }}</FieldLabel>
                <FeedSearch
                  id="release-search"
                  v-model="searchQuery"
                  v-model:scope="searchScope"
                  :searching="isSearching || searchingNotes"
                />
                <FieldDescription id="release-search-hint">{{
                  searchScope === 'notes'
                    ? 'Find a change across notes in your current filters.'
                    : 'Search titles and versions. Choose Notes to find a change.'
                }}</FieldDescription>
              </Field>
            </FieldGroup>
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
                    ? `${filteredReleases.length} releases · ${reposProcessed}${reposTotal ? ` of ${reposTotal}` : ''} projects checked…`
                    : `${filteredReleases.length} ${filteredReleases.length === 1 ? 'release' : 'releases'} from ${projectCount} ${projectCount === 1 ? 'project' : 'projects'}`
                }}
              </p>
              <p
                title="Up to nine recent releases from each repository plus its latest stable release, published within the past three months. Full histories are available on GitHub."
              >
                Last 3 months · up to 9 recent releases per project
              </p>
            </div>
          </div>
          <div
            v-if="searchScope === 'notes' && debouncedSearchQuery.trim() && missingNotesCount"
            class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <p>
              {{
                searchingNotes
                  ? 'Searching release notes…'
                  : 'Some release notes could not be searched.'
              }}
              {{ missingNotesCount }} remaining.
            </p>
            <Button
              variant="outline"
              size="sm"
              :disabled="searchingNotes || isLoadingAny || retryDisabled"
              @click="searchAllNotes"
            >
              {{ searchingNotes ? 'Searching…' : 'Retry remaining notes' }}
            </Button>
          </div>
          <Alert v-if="error" variant="destructive">
            <Icon name="lucide:circle-alert" />
            <AlertTitle>Could not load all releases</AlertTitle>
            <AlertDescription class="flex flex-col gap-2 break-words"
              ><p>{{ error }}</p>
              <Button
                v-if="!isLoadingAny"
                :disabled="retryDisabled"
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
              :description-errors="descriptionErrors"
              :retry-disabled="retryDisabled"
              :note-search="searchScope === 'notes' ? debouncedSearchQuery : ''"
              @request-notes="ensureDescriptions"
            />
          </div>
          <Empty v-else-if="!error">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Icon name="lucide:search" /></EmptyMedia>
              <EmptyTitle>{{
                searchingNotes
                  ? 'Searching release notes…'
                  : hasFilters
                    ? 'No matching releases'
                    : 'No recent releases'
              }}</EmptyTitle>
              <EmptyDescription>{{
                hasFilters
                  ? searchingNotes
                    ? 'Matching releases appear as their notes are searched.'
                    : missingNotesCount && searchScope === 'notes' && searchQuery.trim()
                      ? 'Results are incomplete. Retry the remaining notes or change your filters.'
                      : 'Try another repository, search, or release type.'
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
