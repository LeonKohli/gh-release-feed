<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  html: string
  isExpanded?: boolean
}>()

const emit = defineEmits<{
  'update:isExpanded': [boolean]
}>()

const contentRef = ref<HTMLElement | null>(null)
const showToggle = ref(false)
const maxHeight = 300 // Initial max height in pixels

// Check if content needs toggle button
onMounted(() => {
  if (contentRef.value) {
    const needsToggle = contentRef.value.scrollHeight > maxHeight
    showToggle.value = needsToggle
    if (needsToggle) {
      emit('update:isExpanded', false)
    }
  }
})

// Watch for external isExpanded changes
watch(() => props.isExpanded, (newVal) => {
  if (showToggle.value) {
    emit('update:isExpanded', newVal)
  }
})

// Process content with enhanced formatting
const processedContent = computed(() => {
  let content = props.html

  // Common styles
  const linkBaseStyles = 'inline-flex items-center gap-1.5 text-xs font-mono bg-muted/30 hover:bg-primary/5 px-1.5 py-0.5 rounded-md no-underline border border-border/40 hover:border-primary/20 hover:text-primary transition-colors'

  // Replace commit links with better formatting
  content = content.replace(
    /<a class="commit-link"[^>]*href="([^"]*)"[^>]*><tt>([^<]*)<\/tt><\/a>/g,
    (_, href, hash) => `
      <a href="${href}" target="_blank" rel="noopener" class="${linkBaseStyles}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3">
          <path d="M15 3v4a1 1 0 0 0 1 1h4"/>
          <path d="M18 17h-7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4l5 5v7a2 2 0 0 1-2 2z"/>
          <path d="M16 17v2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2"/>
        </svg>
        ${hash}
      </a>
    `
  )

  // Add anchor links to headings
  content = content.replace(
    /<h([1-6])>([^<]*)<\/h[1-6]>/g,
    (_, level, text) => `
      <h${level} class="flex items-center gap-2 group">
        <span class="flex-1">${text}</span>
        <a href="#${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}" class="no-underline transition-opacity opacity-0 group-hover:opacity-100">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-muted-foreground hover:text-primary">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        </a>
      </h${level}>
    `
  )

  // Enhance lists with better bullets and nesting
  content = content
    .replace(/<ul>/g, '<ul class="space-y-1">')
    .replace(
      /<li>/g,
      '<li class="relative flex items-start gap-1"><span class="flex-shrink-0 select-none w-4 text-center mt-[0.15rem] text-[14px] leading-none text-foreground">›</span><div class="flex-1 min-w-0">'
    )
    .replace(/<\/li>/g, '</div></li>')
    .replace(/<ul><li/g, '<ul><li data-depth="1"')
    .replace(/<ul><ul><li/g, '<ul><ul><li data-depth="2"')

  return content
})

const contentStyle = computed(() => ({
  maxHeight: props.isExpanded ? '400px' : `${maxHeight}px`,
}))

const shouldShowGradient = computed(() => {
  return showToggle.value && !props.isExpanded
})
</script>

<template>
  <div class="relative">
    <div 
      ref="contentRef"
      class="release-content bg-card/50 rounded-lg p-3 sm:p-4 transition-[max-height] duration-300 ease-in-out"
      :class="{
        'overflow-y-auto': isExpanded,
        'overflow-hidden': !isExpanded,
        'with-gradient': shouldShowGradient,
        'scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent hover:scrollbar-thumb-border/80': isExpanded
      }"
      :style="contentStyle"
      v-html="processedContent"
    />
  </div>
</template>

<style scoped>
/* Base content styles */
.release-content {
  @apply text-sm text-foreground leading-relaxed;
}

.release-content.with-gradient {
  mask-image: linear-gradient(to bottom, black calc(100% - 60px), transparent);
}

/* Scrollbar styles */
.scrollbar-thin {
  scrollbar-width: thin;
}

.scrollbar-thumb-border {
  scrollbar-color: var(--border) transparent;
}

.scrollbar-track-transparent {
  scrollbar-track-color: transparent;
}

/* Headings */
.release-content :deep(h1),
.release-content :deep(h2),
.release-content :deep(h3),
.release-content :deep(h4),
.release-content :deep(h5),
.release-content :deep(h6) {
  @apply font-semibold text-foreground mt-6 first:mt-0 mb-3;
}

.release-content :deep(h1) { @apply text-xl; }
.release-content :deep(h2) { @apply text-lg border-b border-border/60 pb-2; }
.release-content :deep(h3) { @apply text-base; }
.release-content :deep(h4) { @apply text-sm; }

/* Lists */
.release-content :deep(ul),
.release-content :deep(ol) {
  @apply my-3;
}

.release-content :deep(ul ul),
.release-content :deep(ol ol),
.release-content :deep(ul ol),
.release-content :deep(ol ul) {
  @apply mt-1.5 mb-0 ml-3;
}

/* List items */
.release-content :deep(li) {
  @apply leading-normal;
}

.release-content :deep(li > div) {
  @apply leading-relaxed;
}

.release-content :deep(li + li) {
  @apply mt-1.5;
}

/* List item bullets */
.release-content :deep(li[data-depth="1"] > span) {
  @apply text-[14px] text-foreground/90;
  content: "›";
}

.release-content :deep(li[data-depth="2"] > span) {
  @apply text-[12px] text-foreground/80;
  content: "›";
}

/* Paragraphs and text content */
.release-content :deep(p) {
  @apply my-3 text-foreground/90;
}

.release-content :deep(p),
.release-content :deep(li),
.release-content :deep(td) {
  @apply break-words;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
}

/* Code blocks */
.release-content :deep(pre) {
  @apply bg-muted/30 p-3 rounded-md border border-border/60 my-3 overflow-x-auto text-[13px] leading-relaxed max-w-full;
}

.release-content :deep(pre code) {
  @apply whitespace-pre-wrap break-all sm:break-normal;
}

.release-content :deep(code:not(pre code)) {
  @apply bg-muted/30 px-1.5 py-0.5 rounded text-[13px] font-mono border border-border/40 text-foreground/90 break-all sm:break-normal;
}

/* Links */
.release-content :deep(a:not(.commit-link)) {
  @apply text-primary hover:text-primary/90 hover:underline font-medium;
}

.release-content :deep(.commit-link) {
  @apply inline-flex items-center gap-1.5 text-xs font-mono bg-muted/30 hover:bg-primary/5 px-1.5 py-0.5 rounded-md no-underline border border-border/40 hover:border-primary/20 hover:text-primary transition-colors break-all sm:break-normal;
}

/* Tables */
.release-content :deep(table) {
  @apply w-full border-collapse my-3 block overflow-x-auto sm:table;
  max-width: calc(100vw - 2rem);
}

.release-content :deep(th) {
  @apply bg-muted/30 px-3 py-2 border border-border/60 text-left font-semibold;
}

.release-content :deep(td) {
  @apply px-3 py-2 border border-border/60;
}

/* Other elements */
.release-content :deep(blockquote) {
  @apply border-l-4 border-muted/60 bg-muted/10 p-3 my-3 italic text-muted-foreground;
}

.release-content :deep(img) {
  @apply rounded-lg border border-border/60 my-3;
  max-width: 100%;
  height: auto;
}

/* Task lists */
.release-content :deep(.task-list-item) {
  @apply flex items-center gap-2;
}

.release-content :deep(.task-list-item input[type="checkbox"]) {
  @apply h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary;
}

/* Nested content spacing */
.release-content :deep(li > p:first-child),
.release-content :deep(li > div > p:first-child) { @apply mt-0; }

.release-content :deep(li > p:last-child),
.release-content :deep(li > div > p:last-child) { @apply mb-0; }

.release-content :deep(li > div > ul:first-child),
.release-content :deep(li > div > ol:first-child) { @apply mt-1.5; }

.release-content :deep(li > div > ul:last-child),
.release-content :deep(li > div > ol:last-child) { @apply mb-0; }
</style> 