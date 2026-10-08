<script setup lang="ts">
import { format, intlFormatDistance } from 'date-fns'
import { useElementVisibility } from '@vueuse/core'
import type { ReleaseObj } from '~/composables/useGithub'

const props = defineProps<{
  release?: ReleaseObj
  releases?: ReleaseObj[]
  retryDisabled?: boolean
  descriptionErrors?: Record<string, string>
}>()
const emit = defineEmits<{ requestNotes: [ids: string[]] }>()
const card = ref<HTMLElement | null>(null)
const visible = useElementVisibility(card)
const releases = computed(() =>
  props.releases?.length ? props.releases : props.release ? [props.release] : [],
)
watch([visible, releases], ([isVisible, items]) => {
  if (isVisible)
    emit(
      'requestNotes',
      items.filter((item) => !item.descriptionLoaded).map((item) => item.id),
    )
})
const mainRelease = computed(() => {
  const release = releases.value[0]
  if (!release) throw new Error('A release card requires at least one release')
  return release
})
const expanded = ref<Record<string, boolean>>({})
const overflowing = ref<Record<string, boolean>>({})
const contentId = useId()
const exactDate = computed(() => format(new Date(mainRelease.value.publishedAt), 'PPPp'))
const relativeDate = computed(() =>
  intlFormatDistance(new Date(mainRelease.value.publishedAt), new Date()),
)
</script>

<template>
  <Card ref="card" class="release-card gap-4">
    <CardHeader class="flex flex-row items-start gap-3">
      <Avatar class="size-9 shrink-0">
        <AvatarImage :src="mainRelease.repo.owner.avatarUrl" alt="" />
        <AvatarFallback>{{
          mainRelease.repo.owner.login.slice(0, 2).toUpperCase()
        }}</AvatarFallback>
      </Avatar>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <RepositoryPreview :repo="mainRelease.repo" />
        <CardDescription class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <time :datetime="mainRelease.publishedAt" :title="exactDate">{{ relativeDate }}</time>
          <span v-if="releases.length > 1">· {{ releases.length }} releases</span>
        </CardDescription>
      </div>
    </CardHeader>
    <CardContent class="flex flex-col gap-6">
      <section
        v-for="release in releases"
        :key="release.id"
        class="flex min-w-0 flex-col gap-3"
        :aria-labelledby="`${contentId}-${release.id}-title`"
      >
        <div class="flex flex-wrap items-center gap-2">
          <h2
            :id="`${contentId}-${release.id}-title`"
            class="min-w-0 text-lg font-semibold break-words"
          >
            <a
              :href="release.url"
              target="_blank"
              rel="noopener noreferrer"
              class="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >{{ release.name || release.tagName }}</a
            >
          </h2>
          <Badge v-if="release.isPrerelease" variant="secondary">Pre-release</Badge>
          <Badge v-if="release.isDraft" variant="outline">Draft</Badge>
        </div>
        <ClientOnly>
          <ReleaseContent
            v-if="release.descriptionHTML"
            :id="`${contentId}-${release.id}-notes`"
            :html="release.descriptionHTML"
            :is-expanded="!!expanded[release.id]"
            @overflow-change="overflowing[release.id] = $event"
          />
          <div v-else-if="descriptionErrors?.[release.id]" class="flex flex-col items-start gap-2">
            <p class="text-sm text-muted-foreground">Could not load release notes.</p>
            <Button
              variant="outline"
              size="sm"
              :disabled="retryDisabled"
              @click="emit('requestNotes', [release.id])"
              >Retry notes</Button
            >
          </div>
          <div
            v-else-if="!release.descriptionLoaded"
            class="flex flex-col gap-2"
            role="status"
            aria-label="Loading release notes"
          >
            <Skeleton class="h-4 w-3/4" />
            <Skeleton class="h-4 w-1/2" />
          </div>
          <p v-else class="text-sm text-muted-foreground">No release notes available.</p>
        </ClientOnly>
        <Button
          v-if="overflowing[release.id]"
          variant="ghost"
          size="sm"
          class="self-start"
          :aria-expanded="!!expanded[release.id]"
          :aria-controls="`${contentId}-${release.id}-notes`"
          @click="expanded[release.id] = !expanded[release.id]"
        >
          {{ expanded[release.id] ? 'Show less' : 'Show more' }}
          <Icon
            :name="expanded[release.id] ? 'lucide:chevron-up' : 'lucide:chevron-down'"
            data-icon="inline-end"
          />
        </Button>
      </section>
    </CardContent>
  </Card>
</template>
