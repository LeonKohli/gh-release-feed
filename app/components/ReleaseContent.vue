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
  font-size: 0.875rem;
  line-height: 1.625;
  color: var(--color-foreground);
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
  font-weight: 600;
  color: var(--color-foreground);
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

.release-content :deep(h1:first-child),
.release-content :deep(h2:first-child),
.release-content :deep(h3:first-child),
.release-content :deep(h4:first-child),
.release-content :deep(h5:first-child),
.release-content :deep(h6:first-child) {
  margin-top: 0;
}

.release-content :deep(h1) { font-size: 1.25rem; }
.release-content :deep(h2) {
  font-size: 1.125rem;
  border-bottom: 1px solid rgb(from var(--color-border) r g b / 0.6);
  padding-bottom: 0.5rem;
}
.release-content :deep(h3) { font-size: 1rem; }
.release-content :deep(h4) { font-size: 0.875rem; }

/* Lists */
.release-content :deep(ul),
.release-content :deep(ol) {
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
}

.release-content :deep(ul ul),
.release-content :deep(ol ol),
.release-content :deep(ul ol),
.release-content :deep(ol ul) {
  margin-top: 0.375rem;
  margin-bottom: 0;
  margin-left: 0.75rem;
}

/* List items */
.release-content :deep(li) {
  line-height: 1.5;
}

.release-content :deep(li > div) {
  line-height: 1.625;
}

.release-content :deep(li + li) {
  margin-top: 0.375rem;
}

/* List item bullets */
.release-content :deep(li[data-depth="1"] > span) {
  font-size: 14px;
  color: rgb(from var(--color-foreground) r g b / 0.9);
  content: "›";
}

.release-content :deep(li[data-depth="2"] > span) {
  font-size: 12px;
  color: rgb(from var(--color-foreground) r g b / 0.8);
  content: "›";
}

/* Paragraphs and text content */
.release-content :deep(p) {
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
  color: rgb(from var(--color-foreground) r g b / 0.9);
}

.release-content :deep(p),
.release-content :deep(li),
.release-content :deep(td) {
  word-break: break-word;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
}

/* Code blocks */
.release-content :deep(pre) {
  background-color: rgb(from var(--color-muted) r g b / 0.3);
  padding: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid rgb(from var(--color-border) r g b / 0.6);
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.625;
  max-width: 100%;
}

.release-content :deep(pre code) {
  white-space: pre-wrap;
  word-break: break-all;
}

@media (min-width: 640px) {
  .release-content :deep(pre code) {
    word-break: normal;
  }
}

.release-content :deep(code:not(pre code)) {
  background-color: rgb(from var(--color-muted) r g b / 0.3);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 13px;
  font-family: monospace;
  border: 1px solid rgb(from var(--color-border) r g b / 0.4);
  color: rgb(from var(--color-foreground) r g b / 0.9);
  word-break: break-all;
}

@media (min-width: 640px) {
  .release-content :deep(code:not(pre code)) {
    word-break: normal;
  }
}

/* Links */
.release-content :deep(a:not(.commit-link)) {
  color: var(--color-primary);
  font-weight: 500;
}

.release-content :deep(a:not(.commit-link)):hover {
  color: rgb(from var(--color-primary) r g b / 0.9);
  text-decoration: underline;
}

.release-content :deep(.commit-link) {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-family: monospace;
  background-color: rgb(from var(--color-muted) r g b / 0.3);
  padding: 0.125rem 0.375rem;
  border-radius: 0.375rem;
  text-decoration: none;
  border: 1px solid rgb(from var(--color-border) r g b / 0.4);
  transition: background-color 150ms, border-color 150ms, color 150ms;
  word-break: break-all;
}

.release-content :deep(.commit-link):hover {
  background-color: rgb(from var(--color-primary) r g b / 0.05);
  border-color: rgb(from var(--color-primary) r g b / 0.2);
  color: var(--color-primary);
}

@media (min-width: 640px) {
  .release-content :deep(.commit-link) {
    word-break: normal;
  }
}

/* Tables */
.release-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
  display: block;
  overflow-x: auto;
  max-width: calc(100vw - 2rem);
}

@media (min-width: 640px) {
  .release-content :deep(table) {
    display: table;
  }
}

.release-content :deep(th) {
  background-color: rgb(from var(--color-muted) r g b / 0.3);
  padding: 0.5rem 0.75rem;
  border: 1px solid rgb(from var(--color-border) r g b / 0.6);
  text-align: left;
  font-weight: 600;
}

.release-content :deep(td) {
  padding: 0.5rem 0.75rem;
  border: 1px solid rgb(from var(--color-border) r g b / 0.6);
}

/* Other elements */
.release-content :deep(blockquote) {
  border-left: 4px solid rgb(from var(--color-muted) r g b / 0.6);
  background-color: rgb(from var(--color-muted) r g b / 0.1);
  padding: 0.75rem;
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
  font-style: italic;
  color: var(--color-muted-foreground);
}

.release-content :deep(img) {
  border-radius: 0.5rem;
  border: 1px solid rgb(from var(--color-border) r g b / 0.6);
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
  max-width: 100%;
  height: auto;
}

/* Task lists */
.release-content :deep(.task-list-item) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.release-content :deep(.task-list-item input[type="checkbox"]) {
  height: 0.875rem;
  width: 0.875rem;
  border-radius: 0.25rem;
  border-color: var(--color-border);
  accent-color: var(--color-primary);
}

/* Nested content spacing */
.release-content :deep(li > p:first-child),
.release-content :deep(li > div > p:first-child) { margin-top: 0; }

.release-content :deep(li > p:last-child),
.release-content :deep(li > div > p:last-child) { margin-bottom: 0; }

.release-content :deep(li > div > ul:first-child),
.release-content :deep(li > div > ol:first-child) { margin-top: 0.375rem; }

.release-content :deep(li > div > ul:last-child),
.release-content :deep(li > div > ol:last-child) { margin-bottom: 0; }
</style> 