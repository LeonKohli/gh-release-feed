import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { computed, ref, useId, watch } from 'vue'
import ReleaseCard from '../app/components/ReleaseCard.vue'
import type { ReleaseObj } from '../app/composables/useGithub'

enableAutoUnmount(afterEach)
afterEach(() => vi.unstubAllGlobals())
it('labels only new releases inside a group with readable text and removes labels after review', async () => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('useId', useId)
  const repo = { owner: { login: 'example', avatarUrl: '' } }
  const releases = ['new', 'old'].map((id) => ({
    id,
    name: id,
    publishedAt: '2026-10-17T12:00:00Z',
    repo,
    descriptionLoaded: true,
    descriptionHTML: '',
  })) as ReleaseObj[]
  const stub = { template: '<div><slot /></div>' }
  const wrapper = mount(ReleaseCard, {
    props: { releases, newReleaseIds: new Set(['new']) },
    global: {
      stubs: Object.fromEntries(
        [
          'Card',
          'CardHeader',
          'CardContent',
          'CardDescription',
          'Avatar',
          'AvatarFallback',
          'AvatarImage',
          'RepositoryPreview',
          'Badge',
          'ClientOnly',
        ].map((name) => [name, stub]),
      ),
    },
  })
  const sections = wrapper.findAll('section')
  expect(sections[0]!.text()).toContain('New since your last completed visit')
  expect(sections[1]!.text()).not.toContain('New since')
  await wrapper.setProps({ newReleaseIds: new Set() })
  expect(wrapper.text()).not.toContain('New since')
})
