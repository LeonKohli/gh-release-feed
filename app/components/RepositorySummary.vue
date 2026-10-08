<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { ReleaseObj } from '~/composables/useGithub'

const props = defineProps<{ repo: ReleaseObj['repo'] }>()
const formatCount = (count: number) =>
  new Intl.NumberFormat('en', { notation: 'compact' }).format(count)
const homepage = computed(() => {
  if (!props.repo.homepageUrl) return null
  try {
    const url = new URL(props.repo.homepageUrl)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <Icon name="lucide:book-marked" class="size-4 text-muted-foreground" />
      <span class="min-w-0 font-semibold break-words">{{ repo.owner.login }}/{{ repo.name }}</span>
      <Badge v-if="repo.visibility" variant="outline" class="capitalize">{{
        repo.visibility.toLowerCase()
      }}</Badge>
      <Badge v-if="repo.isArchived" variant="secondary">Archived</Badge>
    </div>
    <p class="text-sm leading-relaxed text-muted-foreground">
      {{ repo.description || 'No description provided.' }}
    </p>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <span v-if="repo.primaryLanguage" class="inline-flex items-center gap-1.5">
        <span
          class="size-2.5 rounded-full"
          :style="{ backgroundColor: repo.primaryLanguage.color || 'currentColor' }"
          aria-hidden="true"
        />
        {{ repo.primaryLanguage.name }}
      </span>
      <span
        class="inline-flex items-center gap-1"
        :title="`${repo.stargazerCount.toLocaleString('en')} stars`"
      >
        <Icon name="lucide:star" class="size-4" /> {{ formatCount(repo.stargazerCount) }} stars
      </span>
      <span v-if="repo.forkCount !== undefined" class="inline-flex items-center gap-1">
        <Icon name="lucide:git-fork" class="size-4" /> {{ formatCount(repo.forkCount) }} forks
      </span>
    </div>
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span v-if="repo.pushedAt" :title="new Date(repo.pushedAt).toLocaleString()"
        >Last push {{ formatDistanceToNow(new Date(repo.pushedAt), { addSuffix: true }) }}</span
      >
      <span v-if="repo.licenseInfo">{{
        repo.licenseInfo.spdxId === 'NOASSERTION' ? 'License unspecified' : repo.licenseInfo.spdxId
      }}</span>
    </div>
    <div class="flex flex-wrap gap-4 text-sm">
      <a
        :href="repo.url"
        target="_blank"
        rel="noopener noreferrer"
        class="underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
        >View repository</a
      >
      <a
        v-if="homepage"
        :href="homepage"
        target="_blank"
        rel="noopener noreferrer"
        class="underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
        >Website</a
      >
    </div>
  </div>
</template>
