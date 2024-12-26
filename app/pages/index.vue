<!-- pages/index.vue -->
<template>
  <div class="min-h-screen bg-background">
    <div class="container px-4 sm:px-6">
      <!-- Header -->
      <header class="sticky top-0 z-10 py-4 sm:py-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div class="flex flex-col gap-4">
          <!-- Top Bar -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <Icon name="lucide:rss" class="w-6 h-6 text-primary" />
              <h1 class="text-xl font-bold sm:text-2xl">Release Feed</h1>
            </div>

            <AuthState v-slot="{ loggedIn, clear, session }">
              <div v-if="loggedIn" class="flex items-center gap-3">
                <ClientOnly>
                  <template #default>
                    <DropdownMenu v-if="loading">
                      <DropdownMenuTrigger class="relative">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          :disabled="loading"
                          class="relative"
                          :title="loading ? 'Loading details...' : 'Refresh releases'"
                        >
                          <Icon 
                            name="lucide:refresh-cw" 
                            class="w-5 h-5" 
                            :class="{ 'animate-spin': loading }" 
                          />
                          <span class="absolute -top-1 -right-1">
                            <span class="relative flex w-2 h-2">
                              <span class="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping bg-primary"></span>
                              <span class="relative inline-flex w-2 h-2 rounded-full bg-primary"></span>
                            </span>
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" class="w-64">
                        <DropdownMenuLabel>Loading Status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <div class="px-2 py-1.5 text-sm">
                          <div class="space-y-2">
                            <div class="flex items-center justify-between gap-4">
                              <span class="text-muted-foreground">Repositories Found:</span>
                              <span class="font-medium">{{ reposProcessed }}</span>
                            </div>
                            <div class="flex items-center justify-between gap-4">
                              <span class="text-muted-foreground">API Calls Left:</span>
                              <span class="font-medium">{{ rateLimitRemaining }}</span>
                            </div>
                            <div v-if="retries > 0" class="flex items-center justify-between gap-4 text-yellow-500">
                              <span>Retries:</span>
                              <span class="font-medium">{{ retries }}</span>
                            </div>
                            <div v-if="rateLimitResetAt" class="flex items-center justify-between gap-4">
                              <span class="text-muted-foreground">Rate Limit Resets:</span>
                              <span class="font-medium">{{ formatResetTime }}</span>
                            </div>
                            <div class="pt-1 text-xs text-muted-foreground">
                              Loading releases from starred repositories...
                            </div>
                          </div>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button 
                      v-else
                      variant="ghost" 
                      size="icon"
                      class="relative"
                      @click="handleRefresh"
                      title="Refresh releases"
                    >
                      <Icon name="lucide:refresh-cw" class="w-5 h-5" />
                    </Button>
                  </template>
                  <template #fallback>
                    <div class="w-9 h-9"></div>
                  </template>
                </ClientOnly>

                <DropdownMenu>
                  <DropdownMenuTrigger class="flex items-center gap-2 outline-none">
                    <Avatar class="w-8 h-8 transition-transform hover:scale-105">
                      <AvatarImage
                        v-if="session?.user?.avatarUrl"
                        :src="session.user.avatarUrl"
                        :alt="session.user.name || 'User avatar'"
                      />
                      <AvatarFallback v-else>
                        {{ (session?.user?.name || 'User')[0]?.toUpperCase() }}
                      </AvatarFallback>
                    </Avatar>
                    <div class="hidden text-sm sm:block">
                      <span class="font-medium">{{ session?.user?.name }}</span>
                    </div>
                    <Icon name="lucide:chevron-down" class="w-4 h-4 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-48">
                    <DropdownMenuLabel>Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @click="handleLogout">
                      <LogOutIcon class="w-4 h-4 mr-2" />
                      <span>Logout</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Button v-else @click="navigateTo('/login')" class="gap-2">
                <LogInIcon class="w-4 h-4" />
                Login with GitHub
              </Button>
            </AuthState>
          </div>
        </div>
      </header>

      <!-- Main Content -->
      <main class="pb-8">
        <div v-if="!loggedIn">
          <Card class="my-4 sm:my-8">
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
              <AlertCircleIcon class="w-4 h-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{{ error }}</AlertDescription>
            </Alert>
          </div>

          <!-- Loading Skeleton -->
          <div v-if="loading && (!visibleReleases.length || reposProcessed === 0)" class="grid gap-4 sm:gap-6">
            <Card v-for="n in 3" :key="n" class="p-3 sm:p-6">
              <div class="space-y-4 animate-pulse">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-muted"></div>
                  <div class="flex-1 space-y-2">
                    <div class="w-1/4 h-4 rounded bg-muted"></div>
                    <div class="w-1/3 h-3 rounded bg-muted"></div>
                  </div>
                </div>
                <div class="space-y-2">
                  <div class="w-3/4 h-5 rounded bg-muted"></div>
                  <div class="w-1/2 h-4 rounded bg-muted"></div>
                </div>
              </div>
            </Card>
          </div>

          <div v-else class="grid gap-4 sm:gap-6">
            <template v-if="visibleReleases.length > 0">
              <div class="grid gap-4 sm:gap-6">
                <ReleaseCard v-for="release in visibleReleases" :key="release.id" :release="release" />
              </div>
            </template>
            <div v-else-if="!loading" class="py-8 text-center text-muted-foreground">
              No releases found in the last 3 months
            </div>
          </div>

          <div v-if="hasMoreReleases" ref="loadMoreTrigger" class="py-6 text-center sm:py-8">
            <Button v-if="!loading" @click="page++" class="w-full sm:w-auto">Load More</Button>
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
import { LogInIcon, LogOutIcon, AlertCircleIcon } from 'lucide-vue-next'
import { useStorage, useDocumentVisibility, useElementVisibility, useTimeAgo, useEventListener } from '@vueuse/core'

// Use document visibility to pause/resume loading when tab is hidden
const visibility = useDocumentVisibility()
watch(visibility, (currentVisibility) => {
  if (currentVisibility === 'visible' && loggedIn.value) {
    fetchReleases()
  }
})

const { loggedIn, clear } = useUserSession()
const {
  releases,
  loading,
  progress,
  error,
  reposProcessed,
  rateLimitRemaining,
  rateLimitResetAt,
  retries,
  fetchReleases,
  clearCache
} = useGithub()

const page = ref(1)
const perPage = 20

const visibleReleases = computed(() => {
  return releases.value?.slice(0, page.value * perPage) || []
})

const hasMoreReleases = computed(() => {
  return visibleReleases.value.length < (releases.value?.length || 0)
})

// Use element visibility for infinite scroll with options
const loadMoreTrigger = ref<HTMLElement | null>(null)
const isLoadMoreVisible = useElementVisibility(loadMoreTrigger)

// Use throttle for smoother scroll loading
const handleLoadMore = useThrottleFn(() => {
  if (!loading.value && hasMoreReleases.value) {
    page.value++
  }
}, 500)

// Watch visibility with throttled handler
watchDebounced(
  isLoadMoreVisible,
  (visible) => {
    if (visible) handleLoadMore()
  },
  { debounce: 100 }
)

// Force refresh releases with better error handling
const refreshEvent = createEventHook<Error>()
refreshEvent.on((error) => {
  console.error('Error refreshing releases:', error)
})

const handleRefresh = useDebounceFn(async () => {
  if (loading.value) return
  try {
    page.value = 1 // Reset to first page
    await clearCache() // Clear the cache first
    await fetchReleases() // Then fetch fresh data
  } catch (error) {
    if (error instanceof Error) {
      refreshEvent.trigger(error)
    }
  }
}, 300)

// Use time ago with options for rate limit reset time
const formatResetTime = computed(() => {
  if (!rateLimitResetAt.value) return ''
  return useTimeAgo(new Date(rateLimitResetAt.value)).value
})

// Initial data loading
const { isLoading } = useAsyncState(
  async () => {
    if (loggedIn.value) {
      await fetchReleases()
    }
  },
  null,
  {
    immediate: true,
    onError: (error) => {
      console.error('Error loading initial data:', error)
    }
  }
)

// Keyboard shortcuts
useEventListener(document, 'keydown', (e: KeyboardEvent) => {
  // Refresh on Ctrl/Cmd + R
  if ((e.ctrlKey || e.metaKey) && e.key === 'r' && !loading.value) {
    e.preventDefault()
    handleRefresh()
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
</script>

<style>
/* Removed transition styles */
</style>