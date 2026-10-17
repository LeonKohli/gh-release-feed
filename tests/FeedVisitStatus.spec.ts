import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, expect, it } from 'vitest'
import FeedVisitStatus from '../app/components/FeedVisitStatus.vue'

enableAutoUnmount(afterEach)
const global = { stubs: { Button: { template: '<button><slot /></button>' } } }
it('explains first visits, the full-feed scope, and storage limitations with an explicit action', async () => {
  const wrapper = mount(FeedVisitStatus, {
    props: { lastReviewedAt: null, newCount: 0, canComplete: false, storageUnavailable: true },
    global,
  })
  expect(wrapper.text()).toContain('First visit?')
  expect(wrapper.text()).toContain('including releases hidden by filters')
  expect(wrapper.text()).toContain('may not be saved')
  expect(wrapper.get('button').attributes('aria-describedby')).toBe('visit-review-help')
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('complete')).toBeUndefined()
  await wrapper.setProps({ canComplete: true })
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('complete')).toHaveLength(1)
})
it('announces the number in the current view and updates after explicit completion', async () => {
  const wrapper = mount(FeedVisitStatus, {
    props: { lastReviewedAt: 1, newCount: 2, canComplete: true, storageUnavailable: false },
    global,
  })
  expect(wrapper.get('[role="status"]').text()).toContain('2 new releases in this view')
  expect(wrapper.get('[role="status"]').attributes('aria-live')).toBe('polite')
  await wrapper.setProps({ newCount: 0, lastReviewedAt: 2 })
  expect(wrapper.get('[role="status"]').text()).toContain('0 new releases')
})
