<script setup lang="ts">
import { format, intlFormatDistance } from 'date-fns'
import type { ReleaseObj } from '~/composables/useGithub'

const props = defineProps<{ release?: ReleaseObj; releases?: ReleaseObj[] }>()
const releases = computed(() =>
  props.releases?.length ? props.releases : props.release ? [props.release] : [],
)
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
function sanitizeDescription(html: string) {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
}
</script>

<template>
  <Card class="release-card gap-4">
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
            :html="sanitizeDescription(release.descriptionHTML)"
            :is-expanded="!!expanded[release.id]"
            @overflow-change="overflowing[release.id] = $event"
          />
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
