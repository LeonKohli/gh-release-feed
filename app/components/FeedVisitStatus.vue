<script setup lang="ts">
defineProps<{
  lastReviewedAt: number | null
  newCount: number
  canComplete: boolean
  storageUnavailable: boolean
}>()
defineEmits<{ complete: [] }>()
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
    <div class="min-w-0 flex-1 basis-48">
      <p role="status" aria-live="polite" aria-atomic="true">
        <template v-if="lastReviewedAt === null">
          First visit? Mark the feed reviewed to highlight new releases next time.
        </template>
        <template v-else>
          {{ newCount }} new {{ newCount === 1 ? 'release' : 'releases' }} in this view since your
          last completed visit.
        </template>
      </p>
      <p id="visit-review-help">
        Reviews the entire loaded feed, including releases hidden by filters.
      </p>
      <p v-if="storageUnavailable">Visit progress may not be saved on this device.</p>
    </div>
    <Button
      variant="ghost"
      size="sm"
      :disabled="!canComplete"
      aria-describedby="visit-review-help"
      @click="$emit('complete')"
      >Mark feed reviewed</Button
    >
  </div>
</template>
