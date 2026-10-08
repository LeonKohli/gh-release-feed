<script setup lang="ts">
defineProps<{ id: string; searching: boolean }>()
const model = defineModel<string>({ default: '' })
</script>

<template>
  <InputGroup>
    <InputGroupInput
      :id="id"
      :model-value="model"
      type="search"
      aria-label="Search releases"
      placeholder="Search repositories or releases…"
      @update:model-value="model = String($event)"
    />
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
    </InputGroupAddon>
  </InputGroup>
</template>
