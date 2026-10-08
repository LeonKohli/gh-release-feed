<script setup lang="ts">
import { useTimeAgo } from '@vueuse/core'

const props = defineProps<{
  isLoadingAny: boolean
  loadingState: string
  reposProcessed: number
  rateLimitRemaining: number
  rateLimitResetAt: string | null
  retryDisabled?: boolean
  retries: number
}>()
const emit = defineEmits<{ refresh: []; logout: [] }>()
const { loggedIn } = useUserSession()
const resetTime = useTimeAgo(computed(() => props.rateLimitResetAt || Date.now()))
</script>

<template>
  <header
    class="sticky top-0 z-10 flex flex-col gap-3 bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/90"
  >
    <div class="flex items-center justify-between gap-3">
      <div class="flex shrink-0 items-center gap-2">
        <Icon name="lucide:rss" class="hidden size-5 text-muted-foreground min-[360px]:block" />
        <h1 class="text-lg font-semibold">Release Feed</h1>
      </div>
      <div class="flex min-w-0 items-center gap-1 sm:gap-2">
        <AuthState v-slot="{ loggedIn, session }">
          <template v-if="loggedIn">
            <ClientOnly>
              <Popover v-if="isLoadingAny">
                <PopoverTrigger as-child>
                  <Button variant="ghost" size="icon" :aria-label="loadingState"
                    ><Icon name="lucide:refresh-cw" class="animate-spin motion-reduce:animate-none"
                  /></Button>
                </PopoverTrigger>
                <PopoverContent align="end" aria-label="Loading status" class="w-72">
                  <div class="flex flex-col gap-2 text-sm">
                    <p class="font-medium">Loading releases</p>
                    <p class="text-muted-foreground">{{ reposProcessed }} repositories checked</p>
                    <p class="text-muted-foreground">
                      {{ rateLimitRemaining }} API points remaining
                    </p>
                    <p v-if="retries" class="text-muted-foreground">{{ retries }} retries</p>
                    <p v-if="rateLimitResetAt" class="text-muted-foreground">
                      Rate limit resets {{ resetTime }}
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                v-else
                variant="ghost"
                size="icon"
                aria-label="Refresh releases"
                :disabled="retryDisabled"
                :title="
                  retryDisabled
                    ? 'GitHub rate limit reached. Wait before retrying.'
                    : 'Refresh releases'
                "
                @click="emit('refresh')"
                ><Icon name="lucide:refresh-cw"
              /></Button>
              <template #fallback><div class="size-9" /></template>
            </ClientOnly>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" aria-label="Account menu" class="gap-2 px-2">
                  <Avatar class="size-7">
                    <AvatarImage
                      v-if="session?.user?.avatarUrl"
                      :src="session.user.avatarUrl"
                      alt=""
                    />
                    <AvatarFallback>{{
                      (session?.user?.name || 'User')[0]?.toUpperCase()
                    }}</AvatarFallback>
                  </Avatar>
                  <span class="hidden max-w-32 truncate sm:block">{{ session?.user?.name }}</span>
                  <Icon name="lucide:chevron-down" class="hidden sm:inline" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem @click="emit('logout')"
                    ><Icon name="lucide:log-out" /> Sign out</DropdownMenuItem
                  >
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </template>
          <Button v-else as-child
            ><NuxtLink to="/login"
              ><Icon name="lucide:github" data-icon="inline-start" /> Sign in</NuxtLink
            ></Button
          >
        </AuthState>
      </div>
    </div>
  </header>
</template>
