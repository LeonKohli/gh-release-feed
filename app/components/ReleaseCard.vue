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
              :src="mainRelease.repo.owner.avatarUrl" 
              :alt="mainRelease.repo.owner.login" 
              loading="lazy"
              class="object-cover w-full h-full rounded-full aspect-square"
              width="40"
              height="40"
            />
            <AvatarFallback class="hidden">{{ mainRelease.repo.owner.login.slice(0, 2).toUpperCase() }}</AvatarFallback>
          </Avatar>
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <NuxtLink :to="mainRelease.repo.owner.url" target="_blank" rel="noopener noreferrer" class="truncate text-foreground hover:text-foreground/90 hover:underline">
                {{ mainRelease.repo.owner.login }}
              </NuxtLink>
              <span class="flex-shrink-0 text-muted-foreground">/</span>
              <NuxtLink :to="mainRelease.repo.url" target="_blank" rel="noopener noreferrer" class="font-medium truncate text-foreground hover:text-foreground/90 hover:underline">
                {{ mainRelease.repo.name }}
              </NuxtLink>
              <Badge 
                v-if="isGrouped"
                variant="secondary" 
                class="flex-shrink-0 gap-1 transition-all whitespace-nowrap group-hover/card:shadow-sm"
              >
                {{ releases.length }} releases
              </Badge>
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
              <span v-if="timeDiff" class="text-border">•</span>
              <span 
                v-if="timeDiff"
                class="transition-colors hover:text-foreground cursor-help"
                :title="`Time span between first and last release in this group`"
              >
                {{ timeDiff }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <Badge 
            v-memo="[mainRelease.repo.licenseInfo]" 
            :variant="licenseColor === 'green' ? 'default' : 'destructive'"
            class="flex-shrink-0 gap-1 transition-all whitespace-nowrap group-hover/card:shadow-sm"
            :title="licenseText === 'No License' ? 'This repository has no license' : `License: ${licenseText}`"
          >
            <Icon name="lucide:file-text" class="flex-shrink-0 w-4 h-4" />
            {{ licenseText }}
          </Badge>
        </div>
      </div>

      <!-- Single Release Content -->
      <template v-if="!isGrouped">
        <div class="flex flex-col gap-2">
          <NuxtLink 
            :to="mainRelease.url" 
            target="_blank"
            rel="noopener noreferrer"
            class="text-lg font-semibold break-words sm:text-xl hover:text-primary hover:underline group/title"
          >
            <span class="flex items-center gap-2">
              <Icon name="lucide:tag" class="flex-shrink-0 w-5 h-5 transition-colors text-muted-foreground group-hover/title:text-primary" />
              {{ mainRelease.name }}
            </span>
          </NuxtLink>

          <div v-if="mainRelease.isPrerelease || mainRelease.isDraft" class="flex flex-wrap gap-2">
            <Badge 
              v-if="mainRelease.isPrerelease" 
              variant="secondary" 
              class="flex-shrink-0 text-orange-800 transition-all bg-orange-100 hover:bg-orange-100 group-hover/card:shadow-sm"
              title="This is a pre-release version"
            >
              Pre-release
            </Badge>
            <Badge 
              v-if="mainRelease.isDraft" 
              variant="secondary" 
              class="flex-shrink-0 text-gray-800 transition-all bg-gray-100 hover:bg-gray-100 group-hover/card:shadow-sm"
              title="This release is still in draft"
            >
              Draft
            </Badge>
          </div>

          <!-- Description -->
          <ClientOnly>
            <Suspense>
              <div class="relative">
                <ReleaseContent 
                  v-if="mainRelease.descriptionHTML" 
                  :html="sanitizedDescription"
                  v-model:isExpanded="isContentExpanded"
                  @update:isExpanded="onContentExpandChange"
                  class="max-w-full"
                />
              </div>
            </Suspense>
          </ClientOnly>
        </div>
      </template>

      <!-- Grouped Releases Content -->
      <template v-else>
        <div class="mt-4 space-y-4">
          <div v-for="release in releases" :key="release.id" class="relative pl-4 border-l border-border">
            <div class="absolute w-2 h-2 rounded-full -left-1 bg-border"></div>
            <div class="flex flex-col gap-2">
              <NuxtLink 
                :to="release.url" 
                target="_blank"
                rel="noopener noreferrer"
                class="text-lg font-semibold break-words hover:text-primary hover:underline group/title"
              >
                <span class="flex items-center gap-2">
                  <Icon name="lucide:tag" class="flex-shrink-0 w-5 h-5 transition-colors text-muted-foreground group-hover/title:text-primary" />
                  {{ release.name || release.tagName }}
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

              <!-- Description -->
              <ClientOnly>
                <Suspense>
                  <div class="relative">
                    <ReleaseContent 
                      v-if="release.descriptionHTML" 
                      :html="sanitizeDescription(release.descriptionHTML)"
                      v-model:isExpanded="expandedStates[release.id]"
                      @update:isExpanded="(expanded: boolean) => onContentExpandChange(release.id, expanded)"
                      class="max-w-full"
                    />
                  </div>
                </Suspense>
              </ClientOnly>
            </div>
          </div>
        </div>
      </template>

      <!-- Bottom Bar with Languages -->
      <div class="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
        <!-- Languages with truncation -->
        <div class="flex flex-wrap gap-1.5 sm:gap-2 min-w-0">
          <Badge 
            v-for="lang in visibleLanguages" 
            :key="lang.id"
            :variant="lang.id === mainRelease.repo.primaryLanguage?.id ? 'default' : 'secondary'"
            v-memo="[lang.id, lang.name, mainRelease.repo.primaryLanguage?.id]"
            class="flex-shrink-0 text-xs transition-all whitespace-nowrap sm:text-sm group-hover/card:shadow-sm"
            :title="lang.id === mainRelease.repo.primaryLanguage?.id ? 'Primary language' : undefined"
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
          v-if="hasExpandableContent || isGrouped"
          variant="ghost" 
          size="sm"
          class="flex-shrink-0"
          @click="toggleExpand"
        >
          <span class="flex items-center gap-1">
            {{ isExpanded ? 'Show less' : 'Show more' }}
            <Icon v-if="!isExpanded" name="lucide:chevron-down" class="flex-shrink-0 w-4 h-4" />
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
import { useReleaseGroups } from '~/composables/useReleaseGroups'
import DOMPurify from 'isomorphic-dompurify'

interface Language {
  id: string
  name: string
}

const props = defineProps<{
  release?: ReleaseObj
  releases?: ReleaseObj[]
}>()

const { formatGroupTimeDiff } = useReleaseGroups()

const isMobile = useMediaQuery('(max-width: 640px)')

// Determine if we're showing a group or single release
const isGrouped = computed(() => !!props.releases && props.releases.length > 1)

// Ensure we always have a valid mainRelease
const mainRelease = computed(() => {
  if (!props.release && (!props.releases || !props.releases.length)) {
    throw new Error('Either release or releases must be provided')
  }
  const release = props.release || (props.releases?.[0])
  if (!release) {
    throw new Error('No valid release found')
  }
  return release
})

// Ensure we always have a valid releases array
const releases = computed(() => {
  const releaseList = props.releases ?? []
  if (releaseList.length > 0) {
    return releaseList
  }
  if (!props.release) {
    throw new Error('Either release or releases must be provided')
  }
  return [props.release]
})

// Track expanded state for releases
const isContentExpanded = ref(false)
const expandedStates = ref<Record<string, boolean>>({})
const hasExpandableContent = ref(false)

// Track overall expanded state for grouped releases
const isExpanded = computed({
  get: () => isGrouped.value ? Object.values(expandedStates.value).some(v => v) : isContentExpanded.value,
  set: (value) => {
    if (isGrouped.value) {
      // For grouped releases, set all releases' expanded state
      releases.value.forEach(release => {
        expandedStates.value[release.id] = value
      })
    } else {
      isContentExpanded.value = value
    }
  }
})

// Memoize computed properties
const formattedDate = computed(() => {
  return intlFormatDistance(
    new Date(mainRelease.value.publishedAt),
    new Date()
  )
})

const exactDate = computed(() => {
  return format(new Date(mainRelease.value.publishedAt), 'PPPp')
})

const formattedStars = computed(() => {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumSignificantDigits: 3
  }).format(mainRelease.value.repo.stargazerCount)
})

const exactStars = computed(() => {
  return new Intl.NumberFormat('en').format(mainRelease.value.repo.stargazerCount)
})

const licenseText = computed(() => {
  if (!mainRelease.value.repo.licenseInfo) return 'No License'
  return mainRelease.value.repo.licenseInfo.spdxId === 'NOASSERTION'
    ? 'Unspecified'
    : mainRelease.value.repo.licenseInfo.spdxId
})

const licenseColor = computed(() => {
  return mainRelease.value.repo.licenseInfo ? 'green' : 'red'
})

const sanitizedDescription = computed(() => {
  if (!mainRelease.value.descriptionHTML) return ''
  return sanitizeDescription(mainRelease.value.descriptionHTML)
})

// Calculate time difference for grouped releases
const timeDiff = computed(() => {
  if (!isGrouped.value || !props.releases) return null
  return formatGroupTimeDiff({ releases: props.releases } as any)
})

// Extract languages for v-memo optimization
const languages = computed<Language[]>(() => {
  const allLangs = mainRelease.value.repo.languages.edges.map(edge => edge.node)
  // Move primary language to front if it exists
  if (mainRelease.value.repo.primaryLanguage) {
    const primaryIndex = allLangs.findIndex(lang => lang.id === mainRelease.value.repo.primaryLanguage?.id)
    if (primaryIndex > 0 && mainRelease.value.repo.primaryLanguage) {
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

// Toggle expand/collapse for all releases in group
function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

// Add handler for content expand state
function onContentExpandChange(expanded: boolean): void
function onContentExpandChange(id: string, expanded: boolean): void
function onContentExpandChange(idOrExpanded: string | boolean, maybeExpanded?: boolean) {
  if (typeof idOrExpanded === 'string') {
    expandedStates.value[idOrExpanded] = maybeExpanded ?? false
  } else {
    hasExpandableContent.value = true
    isContentExpanded.value = idOrExpanded
  }
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

// Sanitize HTML description using DOMPurify for comprehensive XSS protection
function sanitizeDescription(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'details', 'summary'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel', 'width', 'height'],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
  })
}
</script>

<style>
.release-card {
  contain: content;
  max-width: 100%;
  width: 100%;
}
</style>