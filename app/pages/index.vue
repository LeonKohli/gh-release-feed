<!-- pages/index.vue -->
<template>
  <div class="min-h-screen bg-gray-50">
    <UContainer>
      <!-- Header -->
      <header class="py-8 sticky top-0 bg-gray-50 z-10">
        <div class="flex justify-between items-center">
          <h1 class="text-2xl font-bold">GitHub Release Feed</h1>
          <div v-if="!token" class="flex gap-4 items-center">
            <UInput v-model="inputToken" placeholder="GitHub Token" type="password" :ui="{
              wrapper: 'w-96',
              icon: {
                name: 'i-carbon-password',
                trailing: inputToken ? 'i-carbon-checkmark-filled' : undefined
              }
            }" />
            <UButton icon="i-carbon-login" label="Login" :loading="loading" :disabled="!inputToken" @click="login" />
          </div>
          <div v-else>
            <UButton color="red" variant="soft" icon="i-carbon-logout" label="Logout" @click="logout" />
          </div>
        </div>
        <UProgress v-if="loading" :value="progress * 100" color="primary" class="mt-4" />
      </header>

      <!-- Main Content -->
      <main>
        <div v-if="!token">
          <UCard class="my-8">
            <template #header>
              <h3 class="text-lg font-semibold">Welcome to GitHub Release Feed</h3>
            </template>
            <div class="prose">
              <p>
                This tool helps you track releases from your starred GitHub repositories.
                To get started:
              </p>
              <ol>
                <li>Create a <a href="https://github.com/settings/tokens/new" target="_blank">GitHub Personal Access
                    Token</a></li>
                <li>Give it 'read' access to your starred repositories</li>
                <li>Paste the token above and click Login</li>
              </ol>
            </div>
          </UCard>
        </div>

        <div v-else>
          <div v-if="error" class="mb-4">
            <UAlert :title="error" color="red" variant="soft" icon="i-carbon-warning" />
          </div>

          <div class="grid gap-6">
            <template v-if="visibleReleases.length > 0">
              <TransitionGroup name="list" tag="div" class="grid gap-6">
                <ReleaseCard v-for="release in visibleReleases" :key="release.id" :release="release" />
              </TransitionGroup>
            </template>
            <div v-else-if="!loading" class="text-center py-8 text-gray-500">
              No releases found in the last 3 months
            </div>
          </div>

          <div v-if="hasMoreReleases" ref="loadMoreTrigger" class="py-8 text-center">
            <UButton v-if="!loading" @click="loadMore" label="Load More" />
            <div v-else class="flex justify-center">
              <div class="animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent"></div>
            </div>
          </div>
        </div>
      </main>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
const {
  token,
  releases,
  loading,
  progress,
  error,
  setToken,
  clearToken,
  fetchReleases
} = useGithub()

const inputToken = ref('')
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

// Check localStorage on mount and handle token
onMounted(async () => {
  const savedToken = localStorage.getItem('github_token')
  if (savedToken) {
    setToken(savedToken)
    await fetchReleases()
  }
})

async function login() {
  if (!inputToken.value) return
  setToken(inputToken.value)
  await fetchReleases()
}

function logout() {
  clearToken()
  inputToken.value = ''
  page.value = 1
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