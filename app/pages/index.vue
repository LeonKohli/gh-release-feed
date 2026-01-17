<!-- pages/index.vue -->
<template>
  <div class="min-h-screen bg-background">
    <div class="container max-w-full px-4 mx-auto sm:px-6 sm:max-w-screen-xl">
      <AppNavbar
        v-model:searchQuery="searchQuery"
        :isSearching="isSearching"
        :isLoading="loading"
        :loadingState="loadingState"
        :reposProcessed="reposProcessed"
        :totalRepos="totalRepos"
        @refresh="handleRefresh"
        @logout="handleLogout"
      />

      <!-- Main Content -->
      <main class="pb-8">
        <div v-if="!loggedIn">
          <Card class="my-4 overflow-hidden sm:my-8">
            <CardHeader>
              <CardTitle>Welcome to GitHub Release Feed</CardTitle>
            </CardHeader>
            <CardContent class="prose">
              <p>
                This tool helps you track releases from your starred GitHub repositories.
                Please login with GitHub to get started.
              </p>
            </CardContent>
          </Card>
        </div>

        <div v-else>
          <div v-if="error" class="mb-4">
            <Alert variant="destructive">
              <Icon name="mdi:alert-circle" class="w-4 h-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription class="break-words">{{ error }}</AlertDescription>
            </Alert>
          </div>

          <!-- Show releases as they load -->
          <div class="grid w-full gap-4 sm:gap-6">
            <!-- Show actual releases -->
            <template v-if="visibleReleaseGroups.length > 0">
              <ReleaseCard
                v-for="group in visibleReleaseGroups"
                :key="group.id"
                :releases="group.releases"
                class="w-full"
              />
            </template>

            <!-- Loading skeletons at the end while fetching more -->
            <template v-if="loading">
              <Card v-for="n in (visibleReleaseGroups.length ? 1 : 3)" :key="`skeleton-${n}`" class="flex-1 w-full p-3 overflow-hidden sm:p-6">
                <div class="space-y-6">
                  <div class="flex items-center gap-3">
                    <Skeleton class="flex-shrink-0 w-8 h-8 rounded-full" />
                    <div class="flex-1 min-w-0 space-y-3">
                      <Skeleton class="w-1/4 h-4" />
                      <Skeleton class="w-1/3 h-3" />
                    </div>
                  </div>
                  <div class="space-y-4">
                    <Skeleton class="w-3/4 h-5" />
                    <Skeleton class="w-1/2 h-4" />
                    <Skeleton class="w-full h-24" />
                    <Skeleton class="w-2/3 h-4" />
                  </div>
                </div>
              </Card>
            </template>
          </div>

          <div v-if="hasMoreReleases" ref="loadMoreTrigger" class="py-6 text-center sm:py-8">
            <Button
              v-if="!loading"
              @click="page++"
              class="w-full max-w-xs sm:w-auto"
            >
              <span>Load More</span>
            </Button>
            <div v-else class="flex justify-center">
              <div class="w-8 h-8 border-4 rounded-full animate-spin border-primary border-t-transparent"></div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useElementVisibility, useDebounceFn } from '@vueuse/core'

const { loggedIn, clear, ready } = useUserSession()

// Atom-based approach (fast, no rate limits with auth)
const {
  releases,
  loading,
  error,
  reposProcessed,
  totalRepos,
  loadingRepos,
  loadingReleases,
  fetchAllReleases,
  clearCache
} = useAtomReleases()

const { groupReleases } = useReleaseGroups()

const page = ref(1)
const perPage = 20
const searchQuery = ref('')
const debouncedSearchQuery = ref('')
const isSearching = ref(false)

// Debounced search handler
const updateDebouncedSearch = useDebounceFn((value: string) => {
  isSearching.value = true
  debouncedSearchQuery.value = value
  setTimeout(() => {
    isSearching.value = false
  }, 300)
}, 300)

// Watch for search query changes
watch(searchQuery, (newValue) => {
  isSearching.value = true
  updateDebouncedSearch(newValue)
})

const filteredReleases = computed(() => {
  if (!debouncedSearchQuery.value) return releases.value

  const query = debouncedSearchQuery.value.toLowerCase()
  return releases.value?.filter(release => {
    const repoName = release.repo.name?.toLowerCase() || ''
    const ownerName = release.repo.owner.login?.toLowerCase() || ''
    const releaseName = release.name?.toLowerCase() || ''
    const tagName = release.tagName?.toLowerCase() || ''
    const description = release.descriptionHTML?.toLowerCase() || ''

    return repoName.includes(query) ||
           ownerName.includes(query) ||
           releaseName.includes(query) ||
           tagName.includes(query) ||
           description.includes(query)
  })
})

// Group releases
const releaseGroups = computed(() => {
  if (!filteredReleases.value) return []
  return groupReleases(filteredReleases.value)
})

const visibleReleaseGroups = computed(() => {
  if (!releaseGroups.value) return []
  return releaseGroups.value.slice(0, page.value * perPage)
})

const hasMoreReleases = computed(() => {
  return visibleReleaseGroups.value.length < (releaseGroups.value?.length || 0)
})

// Reset page when search query changes
watch(searchQuery, () => {
  page.value = 1
})

// Use element visibility for infinite scroll
const loadMoreTrigger = ref<HTMLElement | null>(null)
const isLoadMoreVisible = useElementVisibility(loadMoreTrigger)

watchDebounced(
  isLoadMoreVisible,
  (visible) => {
    if (visible && !loading.value && hasMoreReleases.value) {
      page.value++
    }
  },
  { debounce: 100 }
)

// Force refresh releases
const handleRefresh = useDebounceFn(async () => {
  if (loading.value) return
  try {
    page.value = 1
    clearCache()
    await fetchAllReleases()
  } catch (err) {
    console.error('Error refreshing releases:', err)
  }
}, 300)

// Initial data loading
watchEffect(async () => {
  if (ready.value && loggedIn.value) {
    await fetchAllReleases()
  }
})

async function handleLogout() {
  await clear()
  navigateTo('/login')
}

// SEO metadata
useHead({
  title: 'GitHub Release Feed',
  meta: [
    {
      name: 'description',
      content: 'Track releases from your starred GitHub repositories'
    }
  ]
})

// Loading state display
const loadingState = computed(() => {
  if (loadingRepos.value) {
    return `Loading repos (${reposProcessed.value}/${totalRepos.value || '?'})...`
  }
  if (loadingReleases.value) {
    return `Fetching releases (${reposProcessed.value}/${totalRepos.value || '?'})...`
  }
  return 'Refresh releases'
})
</script>
