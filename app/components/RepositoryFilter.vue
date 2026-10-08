<script setup lang="ts">
import type { RepositoryOption } from '~/lib/release-filters'

const props = defineProps<{ repositories: RepositoryOption[] }>()
const allRepositories = 'all-repositories'
const model = defineModel<string | null>({ default: null })
const open = ref(false)
const query = ref('')
const selected = computed(() => props.repositories.find((repo) => repo.id === model.value))
const matches = computed(() => {
  const term = query.value.trim().toLowerCase()
  return props.repositories.filter((repo) =>
    `${repo.label} ${repo.description}`.toLowerCase().includes(term),
  )
})
watch(open, () => {
  query.value = ''
})
</script>

<template>
  <Combobox
    v-model:open="open"
    :model-value="model ?? allRepositories"
    :ignore-filter="true"
    @update:model-value="
      (value) => {
        model = typeof value === 'string' && value !== allRepositories ? value : null
      }
    "
  >
    <ComboboxAnchor as-child>
      <ComboboxTrigger as-child>
        <Button
          id="repository-filter"
          variant="outline"
          class="w-full justify-between"
          aria-label="Filter by repository"
        >
          <span class="truncate">{{
            selected?.label ?? (model ? 'Repository no longer in feed' : 'All repositories')
          }}</span>
          <Icon name="lucide:chevrons-up-down" data-icon="inline-end" />
        </Button>
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxList align="start" class="w-(--reka-combobox-trigger-width) max-w-[calc(100vw-2rem)]">
      <ComboboxInput
        :display-value="() => ''"
        :model-value="query"
        @update:model-value="query = $event"
        placeholder="Repository, owner or description…"
        aria-label="Find a repository"
      />
      <ComboboxViewport>
        <ComboboxGroup>
          <ComboboxItem :value="allRepositories">
            All repositories
            <ComboboxItemIndicator><Icon name="lucide:check" /></ComboboxItemIndicator>
          </ComboboxItem>
          <ComboboxItem v-for="repo in matches" :key="repo.id" :value="repo.id">
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="truncate">{{ repo.label }}</span>
              <span v-if="repo.description" class="truncate text-xs text-muted-foreground">{{
                repo.description
              }}</span>
            </span>
            <span class="text-xs text-muted-foreground">{{ repo.count }}</span>
            <ComboboxItemIndicator><Icon name="lucide:check" /></ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxGroup>
        <p v-if="!matches.length" class="px-3 py-4 text-sm text-muted-foreground">
          No repositories match. Try the owner or project name.
        </p>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
