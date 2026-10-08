<script setup lang="ts">
import type { SearchScope } from '~/lib/release-filters'
defineProps<{ id: string; searching: boolean }>()
const model = defineModel<string>({ default: '' })
const scope = defineModel<SearchScope>('scope', { default: 'titles' })
</script>

<template>
  <InputGroup>
    <InputGroupInput
      :id="id"
      :model-value="model"
      type="search"
      :aria-label="
        scope === 'notes' ? 'Search release notes' : 'Search release titles and versions'
      "
      :placeholder="scope === 'notes' ? 'Search release notes…' : 'Search titles or versions…'"
      aria-describedby="release-search-hint"
      @update:model-value="model = String($event)"
    />
    <span id="release-search-hint" class="sr-only">{{
      scope === 'notes'
        ? 'Search note content within your current filters. Missing notes load automatically.'
        : 'Search release titles and versions. Choose Notes to search for a change.'
    }}</span>
    <InputGroupAddon><Icon name="lucide:search" /></InputGroupAddon>
    <InputGroupAddon align="inline-end">
      <Icon
        v-if="searching"
        name="lucide:loader-2"
        class="animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <InputGroupButton v-if="model" size="icon-xs" aria-label="Clear search" @click="model = ''"
        ><Icon name="lucide:x"
      /></InputGroupButton>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <InputGroupButton aria-label="Search in" size="xs"
            >{{ scope === 'notes' ? 'Notes' : 'Titles'
            }}<Icon name="lucide:chevron-down" data-icon="inline-end"
          /></InputGroupButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup v-model="scope">
            <DropdownMenuRadioItem value="titles">
              <span class="flex flex-col gap-0.5">
                <span>Titles and versions</span>
                <span class="text-xs text-muted-foreground">Find a specific release</span>
              </span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="notes">
              <span class="flex flex-col gap-0.5">
                <span>Release notes</span>
                <span class="text-xs text-muted-foreground"
                  >Find changes, fixes or ticket numbers</span
                >
              </span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </InputGroupAddon>
  </InputGroup>
</template>
