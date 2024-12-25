<!-- components/releases/ReleaseCard.vue -->
<template>
  <UCard class="release-card" :ui="{ body: { padding: 'p-6' } }">
    <div class="flex flex-col gap-4">
      <!-- Header -->
      <div class="flex justify-between items-start">
        <div class="flex items-center gap-3">
          <UAvatar 
            :src="release.repo.owner.avatarUrl" 
            :alt="release.repo.owner.login" 
            loading="lazy"
            width="40"
            height="40"
            class="shrink-0"
          />
          <div>
            <div class="flex items-center gap-2">
              <NuxtLink :to="release.repo.owner.url" target="_blank" class="text-gray-700 hover:text-gray-900 hover:underline">
                {{ release.repo.owner.login }}
              </NuxtLink>
              <span class="text-gray-500">/</span>
              <NuxtLink :to="release.repo.url" target="_blank" class="text-gray-700 hover:text-gray-900 font-medium hover:underline">
                {{ release.repo.name }}
              </NuxtLink>
            </div>
            <div class="text-sm text-gray-500 flex items-center gap-2">
              <span>{{ formattedDate }}</span>
              <span class="text-gray-300">•</span>
              <span class="flex items-center gap-1">
                <div i="carbon-star-filled" class="text-yellow-500" />
                {{ formattedStars }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex gap-2">
          <UBadge 
            v-memo="[release.repo.licenseInfo]" 
            :color="licenseColor"
            variant="subtle"
            class="whitespace-nowrap"
          >
            <template #icon>
              <div i="carbon-license" />
            </template>
            {{ licenseText }}
          </UBadge>
        </div>
      </div>

      <!-- Release Title -->
      <div class="flex flex-col gap-2">
        <NuxtLink :to="release.url" target="_blank" class="text-xl font-semibold hover:text-primary-600 hover:underline">
          {{ release.name }}
        </NuxtLink>

        <div v-if="release.isPrerelease || release.isDraft" class="flex gap-2">
          <UBadge v-if="release.isPrerelease" color="orange" variant="subtle">Pre-release</UBadge>
          <UBadge v-if="release.isDraft" color="gray" variant="subtle">Draft</UBadge>
        </div>
      </div>

      <!-- Description -->
      <ClientOnly>
        <Suspense>
          <div 
            v-if="release.descriptionHTML" 
            class="prose prose-sm max-h-[400px] overflow-y-auto w-full"
            v-html="sanitizedDescription" 
          />
        </Suspense>
      </ClientOnly>

      <!-- Languages -->
      <div class="flex flex-wrap gap-2">
        <UBadge 
          v-for="lang in languages" 
          :key="lang.id"
          :color="lang.id === release.repo.primaryLanguage?.id ? 'primary' : 'gray'"
          variant="subtle"
          v-memo="[lang.id, lang.name, release.repo.primaryLanguage?.id]"
          class="whitespace-nowrap"
        >
          {{ lang.name }}
        </UBadge>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { ReleaseObj } from '~/composables/useGithub'
import { intlFormatDistance } from 'date-fns'

const props = defineProps<{
  release: ReleaseObj
}>()

// Memoize computed properties
const formattedDate = computed(() => {
  return intlFormatDistance(
    new Date(props.release.publishedAt),
    new Date()
  )
})

const formattedStars = computed(() => {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumSignificantDigits: 3
  }).format(props.release.repo.stargazerCount)
})

const licenseText = computed(() => {
  if (!props.release.repo.licenseInfo) return 'No License'
  return props.release.repo.licenseInfo.spdxId === 'NOASSERTION'
    ? 'Unspecified'
    : props.release.repo.licenseInfo.spdxId
})

const licenseColor = computed(() => {
  return props.release.repo.licenseInfo ? 'green' : 'red'
})

const sanitizedDescription = computed(() => {
  if (!props.release.descriptionHTML) return ''
  return props.release.descriptionHTML.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, 
    ''
  )
})

// Extract languages for v-memo optimization
const languages = computed(() => {
  return props.release.repo.languages.edges.map(edge => edge.node)
})
</script>

<style>
.release-card {
  @apply transition-all duration-200;
  contain: content; /* CSS containment for better performance */
}

.prose {
  @apply max-w-none; /* Allow prose to take full width */
}

.prose :deep(pre) {
  @apply bg-gray-100 p-4 rounded-lg overflow-x-auto my-4;
  contain: content;
}

.prose :deep(code) {
  @apply bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono;
}

.prose :deep(p) {
  @apply my-3;
}

.prose :deep(ul), .prose :deep(ol) {
  @apply my-3 pl-6;
}

.prose :deep(li) {
  @apply my-1;
}

.prose :deep(h1), .prose :deep(h2), .prose :deep(h3) {
  @apply font-semibold my-4;
}

.prose :deep(h1) {
  @apply text-2xl;
}

.prose :deep(h2) {
  @apply text-xl;
}

.prose :deep(h3) {
  @apply text-lg;
}

.prose :deep(a) {
  @apply text-primary-600 hover:text-primary-700 hover:underline;
}

.prose :deep(img) {
  @apply rounded-lg shadow-sm max-w-full h-auto my-4;
  contain: size layout;
  width: 100%;
  aspect-ratio: 16/9;
}

.prose :deep(blockquote) {
  @apply border-l-4 border-gray-200 pl-4 my-4 italic;
}

.prose :deep(hr) {
  @apply my-6 border-gray-200;
}

.prose :deep(table) {
  @apply w-full my-4 border-collapse;
}

.prose :deep(th), .prose :deep(td) {
  @apply border border-gray-200 p-2;
}

.prose :deep(th) {
  @apply bg-gray-50;
}
</style>