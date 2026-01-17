<template>
  <header class="sticky top-0 z-10 py-2 sm:py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <div class="flex flex-col gap-2">
      <!-- Top Bar -->
      <div class="flex flex-col gap-2">
        <!-- Main Header Line -->
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <Icon name="lucide:rss" class="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <div class="flex flex-col gap-0.5">
              <h1 class="text-lg font-bold sm:text-xl">Release Feed</h1>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- Search Bar (Desktop) -->
            <div
              v-if="loggedIn"
              class="relative hidden w-64 sm:flex xl:w-80"
            >
              <div class="relative flex items-center w-full">
                <Icon
                  name="lucide:search"
                  class="absolute w-4 h-4 pointer-events-none left-3 text-muted-foreground"
                />
                <Input
                  :value="searchQuery"
                  type="search"
                  placeholder="Search by repo, owner, release..."
                  class="h-9 pr-9 pl-9 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none"
                  @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
                />
                <div class="absolute flex items-center gap-1 right-1">
                  <Icon
                    v-if="isSearching"
                    name="lucide:loader-2"
                    class="w-4 h-4 text-muted-foreground animate-spin"
                  />
                  <Button
                    v-if="searchQuery"
                    variant="ghost"
                    size="sm"
                    class="p-0 h-7 w-7 hover:bg-transparent"
                    @click="emit('update:searchQuery', '')"
                    title="Clear search"
                  >
                    <Icon name="lucide:x" class="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <!-- Mobile Search Toggle -->
            <Button
              v-if="loggedIn"
              variant="ghost"
              size="icon"
              class="relative sm:hidden"
              @click="isSearchVisible = !isSearchVisible"
            >
              <Icon
                :name="isSearchVisible ? 'lucide:x' : 'lucide:search'"
                class="w-5 h-5"
              />
            </Button>

            <AuthState v-slot="{ loggedIn, clear, session }">
              <div v-if="loggedIn" class="flex items-center gap-3">
                <ClientOnly>
                  <template #default>
                    <DropdownMenu v-if="isLoading">
                      <DropdownMenuTrigger class="relative">
                        <Button
                          variant="ghost"
                          size="icon"
                          class="relative opacity-50"
                          :title="loadingState"
                        >
                          <Icon
                            name="lucide:refresh-cw"
                            class="w-5 h-5 text-muted-foreground animate-spin"
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
                              <span class="text-muted-foreground">Repos Processed:</span>
                              <span class="font-medium">{{ reposProcessed }} / {{ totalRepos || '?' }}</span>
                            </div>
                            <div class="pt-1 text-xs text-muted-foreground">
                              Fetching releases via Atom feeds...
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
                      :disabled="isLoading"
                      :title="loadingState"
                    >
                      <Icon
                        name="lucide:refresh-cw"
                        class="w-5 h-5"
                      />
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
                      <Icon name="lucide:log-out" class="w-4 h-4 mr-2" />
                      <span>Logout</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Button v-else @click="navigateTo('/login')" class="gap-2">
                <Icon name="lucide:log-in" class="w-4 h-4" />
                Login with GitHub
              </Button>
            </AuthState>
          </div>
        </div>

        <!-- Search Bar (Mobile Expandable) -->
        <div
          class="relative w-full transition-all duration-200 sm:hidden"
          :class="[
            isSearchVisible ? 'h-10 opacity-100' : 'h-0 opacity-0 overflow-hidden',
          ]"
        >
          <div class="relative flex items-center h-full">
            <Icon
              name="lucide:search"
              class="absolute w-4 h-4 pointer-events-none left-3 text-muted-foreground"
            />
            <Input
              :value="searchQuery"
              type="search"
              placeholder="Search by repo, owner, release..."
              class="h-full pr-9 pl-9 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none"
              @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
            />
            <div class="absolute flex items-center gap-1 right-1">
              <Icon
                v-if="isSearching"
                name="lucide:loader-2"
                class="w-4 h-4 text-muted-foreground animate-spin"
              />
              <Button
                v-if="searchQuery"
                variant="ghost"
                size="sm"
                class="p-0 h-7 w-7 hover:bg-transparent"
                @click="emit('update:searchQuery', '')"
                title="Clear search"
              >
                <Icon name="lucide:x" class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import type { Ref } from 'vue'

const props = defineProps<{
  searchQuery: string
  isSearching: boolean
  isLoading: boolean
  loadingState: string
  reposProcessed: number
  totalRepos: number
}>()

const emit = defineEmits<{
  'update:searchQuery': [string]
  'refresh': []
  'logout': []
}>()

const { loggedIn } = useUserSession()

// Mobile search visibility state
const isSearchVisible = ref<boolean>(false)
const isMobile = useMediaQuery('(max-width: 640px)') as Ref<boolean>

// Reset search visibility when switching between mobile and desktop
watch(isMobile, (mobile) => {
  if (!mobile) {
    isSearchVisible.value = false
  }
})

function handleRefresh() {
  emit('refresh')
}

function handleLogout() {
  emit('logout')
}
</script>
