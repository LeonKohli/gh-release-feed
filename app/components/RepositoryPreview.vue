<script setup lang="ts">
import type { ReleaseObj } from '~/composables/useGithub'

defineProps<{ repo: ReleaseObj['repo'] }>()
const hoverOpen = ref(false)
const popoverOpen = ref(false)
watch(popoverOpen, (open) => {
  if (open) hoverOpen.value = false
})
</script>

<template>
  <div class="flex min-w-0 items-center gap-1">
    <HoverCard v-model:open="hoverOpen" :open-delay="300" :close-delay="150">
      <HoverCardTrigger as-child>
        <a
          :href="repo.url"
          target="_blank"
          rel="noopener noreferrer"
          class="min-w-0 rounded-sm font-medium break-words hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span class="text-muted-foreground">{{ repo.owner.login }} / </span>{{ repo.name }}
        </a>
      </HoverCardTrigger>
      <HoverCardContent
        v-if="!popoverOpen"
        align="start"
        class="max-h-(--reka-hover-card-content-available-height) w-96 max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        <RepositorySummary :repo="repo" />
      </HoverCardContent>
    </HoverCard>
    <Popover v-model:open="popoverOpen">
      <PopoverTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          class="size-8 shrink-0"
          :aria-label="`About ${repo.owner.login}/${repo.name}`"
        >
          <Icon name="lucide:info" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        class="max-h-(--reka-popover-content-available-height) w-96 max-w-[calc(100vw-2rem)] overflow-y-auto"
        :aria-label="`About ${repo.owner.login}/${repo.name}`"
      >
        <RepositorySummary :repo="repo" />
      </PopoverContent>
    </Popover>
  </div>
</template>
