<!-- pages/index.vue -->
<template>
  <div class="min-h-screen bg-background">
    <div class="container px-4 sm:px-6">
      <!-- Header -->
      <header class="py-4 sm:py-8 sticky top-0 bg-background z-10">
        <div class="flex flex-col sm:flex-row sm:items-center gap-4">
          <h1 class="text-xl sm:text-2xl font-bold">GitHub Release Feed</h1>
          <AuthState v-slot="{ loggedIn, clear }">
            <Button v-if="loggedIn" variant="destructive" @click="handleLogout" class="sm:ml-auto">
              <LogOutIcon class="h-4 w-4 mr-2" />
              Logout
            </Button>
            <Button v-else @click="navigateTo('/login')" class="sm:ml-auto">
              <LogInIcon class="h-4 w-4 mr-2" />
              Login with GitHub
            </Button>
          </AuthState>
        </div>
        <Progress v-if="loading" :value="progress * 100" class="mt-4" />
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
              <AlertCircleIcon class="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{{ error }}</AlertDescription>
            </Alert>
          </div>

          <div class="grid gap-4 sm:gap-6">
            <template v-if="visibleReleases.length > 0">
              <TransitionGroup name="list" tag="div" class="grid gap-4 sm:gap-6">
                <ReleaseCard v-for="release in visibleReleases" :key="release.id" :release="release" />
              </TransitionGroup>
            </template>
            <div v-else-if="!loading" class="text-center py-8 text-muted-foreground">
              No releases found in the last 3 months
            </div>
          </div>

          <div v-if="hasMoreReleases" ref="loadMoreTrigger" class="py-6 sm:py-8 text-center">
            <Button v-if="!loading" @click="loadMore" class="w-full sm:w-auto">Load More</Button>
            <div v-else class="flex justify-center">
              <div class="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LogInIcon, LogOutIcon, AlertCircleIcon } from 'lucide-vue-next'

const { loggedIn, clear } = useUserSession()
const {
  releases,
  loading,
  progress,
  error,
  fetchReleases
} = useGithub()

const page = ref(1)
const perPage = 20

const visibleReleases = computed(() => {
  return releases.value?.slice(0, page.value * perPage) || []
})

const hasMoreReleases = computed(() => {
  return visibleReleases.value.length < (releases.value?.length || 0)
})

const loadMoreTrigger = ref<HTMLElement | null>(null)

const loadMore = () => {
  page.value++
}

// Use intersection observer for infinite scroll
if (process.client) {
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry?.isIntersecting && !loading.value && hasMoreReleases.value) {
        loadMore()
      }
    },
    { threshold: 0.5 }
  )

  onMounted(() => {
    if (loadMoreTrigger.value) {
      observer.observe(loadMoreTrigger.value)
    }
  })

  onUnmounted(() => {
    if (loadMoreTrigger.value) {
      observer.unobserve(loadMoreTrigger.value)
    }
    observer.disconnect()
  })
}

// Fetch releases when logged in
watchEffect(async () => {
  if (loggedIn.value) {
    await fetchReleases()
  }
})

async function handleLogout() {
  await clear()
  navigateTo('/login')
}

// Add SEO metadata
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
.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.5s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.list-leave-active {
  position: absolute;
}
</style>