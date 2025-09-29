<!-- pages/index.vue -->
<template>
  <div class="min-h-screen bg-background">
    <div class="container max-w-full px-4 mx-auto sm:px-6 sm:max-w-screen-xl">
      <AppNavbar
        v-model:searchQuery="searchQuery"
        :isSearching="isSearching"
        :isLoadingAny="isLoadingAny"
        :loadingState="loadingState"
        :reposProcessed="reposProcessed"
        :rateLimitRemaining="rateLimitRemaining"
        :rateLimitResetAt="rateLimitResetAt"
        :retries="retries"
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

          <!-- Loading Skeleton -->
          <div 
            v-if="loading && (!visibleReleaseGroups.length || reposProcessed === 0)" 
            class="grid w-full gap-4 sm:gap-6 min-h-[calc(100vh-16rem)]"
          >
            <Card v-for="n in 3" :key="n" class="flex-1 w-full p-3 overflow-hidden sm:p-6">
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
          </div>
          <div v-else class="grid w-full gap-4 sm:gap-6">
            <template v-if="visibleReleaseGroups.length > 0">
              <div class="grid w-full gap-4 sm:gap-6">
                <ReleaseCard 
                  v-for="group in visibleReleaseGroups" 
                  :key="group.id" 
                  :releases="group.releases"
                  class="w-full" 
                />
              </div>
            </template>
          </div>

          <div v-if="hasMoreReleases" ref="loadMoreTrigger" class="py-6 text-center sm:py-8">
            <Button 
              v-if="!loading" 
              @click="page++" 
              class="w-full max-w-xs sm:w-auto"
              :disabled="backgroundLoading"
            >
              <span>Load More</span>
              <span v-if="backgroundLoading" class="ml-2">
                <span class="inline-block w-4 h-4 border-2 rounded-full animate-spin border-primary border-t-transparent"></span>
              </span>
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
import { useStorage, useElementVisibility, useTimeAgo, useMediaQuery, useDebounceFn } from '@vueuse/core'
import type { Ref } from 'vue'
import type { ReleaseGroup } from '~/composables/useReleaseGroups'

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
  clearCache
} = useGithub()

const { groupReleases } = useReleaseGroups()

const page = ref(1)
const perPage = useStorage('release-feed-page-size', 20)
const searchQuery = ref('')
const debouncedSearchQuery = ref('')
const isSearching = ref(false)

// Debounced search handler
const updateDebouncedSearch = useDebounceFn((value: string) => {
  isSearching.value = true
  debouncedSearchQuery.value = value
  // Small delay to show loading state
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
  return releaseGroups.value.slice(0, page.value * perPage.value)
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

// Watch visibility with throttled handler
watchDebounced(
  isLoadMoreVisible,
  (visible) => {
    if (visible && !loading.value && !backgroundLoading.value && hasMoreReleases.value) {
      page.value++
    }
  },
  { debounce: 100 }
)

// Force refresh releases
const handleRefresh = useDebounceFn(async () => {
  if (loading.value || backgroundLoading.value) return
  try {
    page.value = 1 // Reset to first page
    await clearCache() // Clear the cache first
    await fetchReleases() // Then fetch fresh data
  } catch (error) {
    console.error('Error refreshing releases:', error)
  }
}, 300)

// Format time ago for rate limit reset
const formatResetTime = computed(() => {
  if (!rateLimitResetAt.value) return ''
  return useTimeAgo(new Date(rateLimitResetAt.value)).value
})

// Initial data loading - wait for session to be ready before fetching
watchEffect(async () => {
  if (ready.value && loggedIn.value) {
    await fetchReleases()
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

// Computed property for loading state display
const loadingState = computed(() => {
  if (loading.value) return 'Loading releases...'
  if (backgroundLoading.value) return 'Loading more releases...'
  return 'Refresh releases'
})

// Computed property for loading animation
const isLoadingAny = computed(() => loading.value || backgroundLoading.value)

// Mobile search visibility state
const isSearchVisible = ref<boolean>(false)
const isMobile = useMediaQuery('(max-width: 640px)') as Ref<boolean>

// Reset search visibility when switching between mobile and desktop
watch(isMobile, (mobile) => {
  if (!mobile) {
    isSearchVisible.value = false
  }
})
</script>

<style>
/* Removed transition styles */
</style>