<script setup lang="ts">
import { isReleaseType, type ReleaseType } from '~/lib/release-filters'
const model = defineModel<ReleaseType>({ default: 'all' })
const labels = { all: 'All releases', stable: 'Stable', prerelease: 'Pre-releases' }
</script>

<template>
  <div>
    <FieldTitle id="release-type-label" class="sr-only">Release type</FieldTitle>
    <ToggleGroup
      type="single"
      variant="outline"
      class="hidden md:flex"
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
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="outline" class="md:hidden" aria-label="Release type">
          {{ labels[model] }}<Icon name="lucide:chevron-down" data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          :model-value="model"
          @update:model-value="
            (value) => {
              if (isReleaseType(value)) model = value
            }
          "
        >
          <DropdownMenuRadioItem value="all">All releases</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="stable">Stable</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="prerelease">Pre-releases</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
