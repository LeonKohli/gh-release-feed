<script setup lang="ts">
import { isReleaseType, type ReleaseType } from '~/lib/release-filters'
const model = defineModel<ReleaseType>({ default: 'all' })
</script>

<template>
  <Field>
    <FieldTitle id="release-type-label" class="sr-only">Release type</FieldTitle>
    <ToggleGroup
      type="single"
      variant="outline"
      :model-value="model"
      aria-labelledby="release-type-label"
      @update:model-value="
        (value) => {
          if (isReleaseType(value)) model = value
        }
      "
    >
      <ToggleGroupItem value="all">All</ToggleGroupItem>
      <ToggleGroupItem value="stable">Stable</ToggleGroupItem>
      <ToggleGroupItem value="prerelease">Pre-releases</ToggleGroupItem>
    </ToggleGroup>
  </Field>
</template>
