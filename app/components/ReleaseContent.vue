<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  html: string
  isExpanded?: boolean
}>()

const emit = defineEmits<{
  overflowChange: [boolean]
}>()

const contentRef = ref<HTMLElement | null>(null)
const hasOverflow = ref<boolean>()
const maxHeight = 300
let resizeObserver: ResizeObserver | undefined

function measureOverflow() {
  if (!contentRef.value) return

  const nextOverflow = contentRef.value.scrollHeight > maxHeight
  if (nextOverflow !== hasOverflow.value) {
    hasOverflow.value = nextOverflow
    emit('overflowChange', nextOverflow)
  }
}

onMounted(() => {
  measureOverflow()
  resizeObserver = new ResizeObserver(measureOverflow)
  if (contentRef.value) resizeObserver.observe(contentRef.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

watch(() => props.html, measureOverflow, { flush: 'post' })

const contentStyle = computed(() => ({
  maxHeight: props.isExpanded ? 'none' : `${maxHeight}px`,
}))

const shouldShowGradient = computed(() => hasOverflow.value && !props.isExpanded)
</script>

<template>
  <div class="relative">
    <div
      ref="contentRef"
      class="release-content rounded-lg bg-card/50 p-3 transition-[max-height] duration-300 ease-in-out sm:p-4"
      :class="{
        'overflow-visible': isExpanded,
        'overflow-hidden': !isExpanded,
        'with-gradient': shouldShowGradient,
      }"
      :style="contentStyle"
      @load.capture="measureOverflow"
      v-html="html"
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

.release-content :deep(h1) {
  font-size: 1.25rem;
}
.release-content :deep(h2) {
  font-size: 1.125rem;
  border-bottom: 1px solid rgb(from var(--color-border) r g b / 0.6);
  padding-bottom: 0.5rem;
}
.release-content :deep(h3) {
  font-size: 1rem;
}
.release-content :deep(h4) {
  font-size: 0.875rem;
}

/* Lists */
.release-content :deep(ul),
.release-content :deep(ol) {
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
  padding-left: 1.25rem;
}

.release-content :deep(ul) {
  list-style-type: disc;
}

.release-content :deep(ol) {
  list-style-type: decimal;
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

.release-content :deep(li + li) {
  margin-top: 0.375rem;
}

.release-content :deep(li::marker) {
  color: var(--color-muted-foreground);
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
  transition:
    background-color 150ms,
    border-color 150ms,
    color 150ms;
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

.release-content :deep(.task-list-item input[type='checkbox']) {
  height: 0.875rem;
  width: 0.875rem;
  border-radius: 0.25rem;
  border-color: var(--color-border);
  accent-color: var(--color-primary);
}

/* Nested content spacing */
.release-content :deep(li > p:first-child) {
  margin-top: 0;
}

.release-content :deep(li > p:last-child) {
  margin-bottom: 0;
}
</style>
