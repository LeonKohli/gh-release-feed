<!-- components/releases/ReleaseCard.vue -->
<template>
  <Card 
    class="w-full p-3 overflow-hidden transition-all duration-200 sm:p-6 release-card group/card hover:shadow-lg"
    @click="handleCardClick"
  >
    <div class="flex flex-col gap-3 sm:gap-4">
      <!-- Header -->
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex items-start min-w-0 gap-3">
          <Avatar class="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10">
            <NuxtImg 
              :src="release.repo.owner.avatarUrl" 
              :alt="release.repo.owner.login" 
              loading="lazy"
              class="object-cover w-full h-full rounded-full aspect-square"
              width="40"
              height="40"
            />
            <AvatarFallback class="hidden">{{ release.repo.owner.login.slice(0, 2).toUpperCase() }}</AvatarFallback>
          </Avatar>
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <NuxtLink :to="release.repo.owner.url" target="_blank" rel="noopener noreferrer" class="truncate text-foreground hover:text-foreground/90 hover:underline">
                {{ release.repo.owner.login }}
              </NuxtLink>
              <span class="flex-shrink-0 text-muted-foreground">/</span>
              <NuxtLink :to="release.repo.url" target="_blank" rel="noopener noreferrer" class="font-medium truncate text-foreground hover:text-foreground/90 hover:underline">
                {{ release.repo.name }}
              </NuxtLink>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span 
                class="transition-colors hover:text-foreground cursor-help" 
                :title="exactDate"
              >
                {{ formattedDate }}
              </span>
              <span class="text-border">•</span>
              <span 
                class="flex items-center gap-1 transition-colors hover:text-foreground cursor-help" 
                :title="`${exactStars} stars`"
              >
                <Icon name="lucide:star" class="flex-shrink-0 w-4 h-4 text-yellow-500" />
                {{ formattedStars }}
              </span>
              <span class="text-border">•</span>
              <span 
                class="flex items-center gap-1 transition-colors hover:text-foreground cursor-help"
                :title="`Tag: ${release.tagName}`"
              >
                <Icon name="lucide:tag" class="flex-shrink-0 w-4 h-4" />
                <span class="truncate">{{ release.tagName }}</span>
              </span>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <Badge 
            v-memo="[release.repo.licenseInfo]" 
            :variant="licenseColor === 'green' ? 'default' : 'destructive'"
            class="flex-shrink-0 gap-1 transition-all whitespace-nowrap group-hover/card:shadow-sm"
            :title="licenseText === 'No License' ? 'This repository has no license' : `License: ${licenseText}`"
          >
            <Icon name="lucide:file-text" class="flex-shrink-0 w-4 h-4" />
            {{ licenseText }}
          </Badge>
        </div>
      </div>

      <!-- Release Title -->
      <div class="flex flex-col gap-2">
        <NuxtLink 
          :to="release.url" 
          target="_blank"
          rel="noopener noreferrer"
          class="text-lg font-semibold break-words sm:text-xl hover:text-primary hover:underline group/title"
        >
          <span class="flex items-center gap-2">
            <Icon name="lucide:tag" class="flex-shrink-0 w-5 h-5 transition-colors text-muted-foreground group-hover/title:text-primary" />
            {{ release.name }}
          </span>
        </NuxtLink>

        <div v-if="release.isPrerelease || release.isDraft" class="flex flex-wrap gap-2">
          <Badge 
            v-if="release.isPrerelease" 
            variant="secondary" 
            class="flex-shrink-0 text-orange-800 transition-all bg-orange-100 hover:bg-orange-100 group-hover/card:shadow-sm"
            title="This is a pre-release version"
          >
            Pre-release
          </Badge>
          <Badge 
            v-if="release.isDraft" 
            variant="secondary" 
            class="flex-shrink-0 text-gray-800 transition-all bg-gray-100 hover:bg-gray-100 group-hover/card:shadow-sm"
            title="This release is still in draft"
          >
            Draft
          </Badge>
        </div>
      </div>

      <!-- Description -->
      <ClientOnly>
        <Suspense>
          <div class="relative">
            <ReleaseContent 
              v-if="release.descriptionHTML" 
              :html="sanitizedDescription"
              v-model:isExpanded="isContentExpanded"
              @update:isExpanded="onContentExpandChange"
              class="max-w-full"
            />
          </div>
        </Suspense>
      </ClientOnly>

      <!-- Bottom Bar with Languages and Expand/Collapse -->
      <div class="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
        <!-- Languages with truncation -->
        <div class="flex flex-wrap gap-1.5 sm:gap-2 min-w-0">
          <Badge 
            v-for="lang in visibleLanguages" 
            :key="lang.id"
            :variant="lang.id === release.repo.primaryLanguage?.id ? 'default' : 'secondary'"
            v-memo="[lang.id, lang.name, release.repo.primaryLanguage?.id]"
            class="flex-shrink-0 text-xs transition-all whitespace-nowrap sm:text-sm group-hover/card:shadow-sm"
            :title="lang.id === release.repo.primaryLanguage?.id ? 'Primary language' : undefined"
          >
            {{ lang.name }}
          </Badge>
          <Badge 
            v-if="hiddenLanguagesCount"
            variant="secondary"
            class="flex-shrink-0 text-xs transition-all whitespace-nowrap sm:text-sm group-hover/card:shadow-sm"
            :title="`${hiddenLanguagesCount} more languages`"
          >
            +{{ hiddenLanguagesCount }} more
          </Badge>
        </div>

        <!-- Expand/Collapse Button -->
        <Button 
          v-if="hasExpandableContent"
          variant="ghost" 
          size="sm"
          class="flex-shrink-0"
          @click="isContentExpanded = !isContentExpanded"
        >
          <span class="flex items-center gap-1">
            {{ isContentExpanded ? 'Show less' : 'Show more' }}
            <Icon v-if="!isContentExpanded" name="lucide:chevron-down" class="flex-shrink-0 w-4 h-4" />
            <Icon v-else name="lucide:chevron-up" class="flex-shrink-0 w-4 h-4" />
          </span>
        </Button>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import type { ReleaseObj } from '~/composables/useGithub'
import { intlFormatDistance, format } from 'date-fns'
import { useMediaQuery } from '@vueuse/core'

interface Language {
  id: string
  name: string
}

const props = defineProps<{
  release: ReleaseObj
  isExpanded?: boolean
  hasExpandButton?: boolean
}>()

const emit = defineEmits<{
  'toggle-expand': []
}>()

const isContentExpanded = ref(false)
const hasExpandableContent = ref(false)

const isMobile = useMediaQuery('(max-width: 640px)')

// Memoize computed properties
const formattedDate = computed(() => {
  return intlFormatDistance(
    new Date(props.release.publishedAt),
    new Date()
  )
})

const exactDate = computed(() => {
  return format(new Date(props.release.publishedAt), 'PPPp')
})

const formattedStars = computed(() => {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumSignificantDigits: 3
  }).format(props.release.repo.stargazerCount)
})

const exactStars = computed(() => {
  return new Intl.NumberFormat('en').format(props.release.repo.stargazerCount)
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
const languages = computed<Language[]>(() => {
  const allLangs = props.release.repo.languages.edges.map(edge => edge.node)
  // Move primary language to front if it exists
  if (props.release.repo.primaryLanguage) {
    const primaryIndex = allLangs.findIndex(lang => lang.id === props.release.repo.primaryLanguage?.id)
    if (primaryIndex > 0 && props.release.repo.primaryLanguage) {
      const [primary] = allLangs.splice(primaryIndex, 1)
      if (primary) {
        allLangs.unshift(primary)
      }
    }
  }
  return allLangs
})

// Truncate languages if they would stack (show max 3 on mobile, 5 on desktop)
const maxVisibleLanguages = computed(() => typeof window !== 'undefined' ? (window.innerWidth < 640 ? 3 : 5) : 5)

const visibleLanguages = computed(() => {
  return languages.value.slice(0, maxVisibleLanguages.value)
})

const hiddenLanguagesCount = computed(() => {
  const count = languages.value.length - maxVisibleLanguages.value
  return count > 0 ? count : 0
})

// Add handler for content expand state
function onContentExpandChange(expanded: boolean) {
  hasExpandableContent.value = true
  isContentExpanded.value = expanded
}

// Handle card click for mobile devices
function handleCardClick(event: MouseEvent) {
  // Only handle tap on mobile
  if (!isMobile.value) return
  
  // Don't trigger if clicking on a link or button
  const target = event.target as HTMLElement
  if (
    target.tagName === 'A' || 
    target.tagName === 'BUTTON' ||
    target.closest('a') ||
    target.closest('button')
  ) return

  // Toggle content if expandable
  if (hasExpandableContent.value) {
    isContentExpanded.value = !isContentExpanded.value
  }
}
</script>

<style>
.release-card {
  contain: content;
  max-width: 100%;
  width: 100%;
}
</style>