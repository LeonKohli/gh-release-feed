import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ReleaseContent from '../app/components/ReleaseContent.vue'

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ReleaseContent', () => {
  it('preserves release markup while removing executable HTML', () => {
    const wrapper = mount(ReleaseContent, {
      props: {
        html: '<h2>Changes</h2><p><strong>Fixed</strong> <a href="https://github.com/example/repo">details</a></p><script>alert(1)</script><img src="/release.png" onerror="alert(1)"><a href="javascript:alert(1)">unsafe</a><iframe src="https://example.com"></iframe>',
      },
    })

    expect(wrapper.get('h2').text()).toBe('Changes')
    expect(wrapper.get('strong').text()).toBe('Fixed')
    expect(wrapper.get('a').attributes('href')).toBe('https://github.com/example/repo')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.get('img').attributes('onerror')).toBeUndefined()
    expect(wrapper.findAll('a')[1]?.attributes('href')).toBeUndefined()
  })

  it.each([
    { initialHeight: 100, nextHeight: 600, expectedOverflow: true },
    { initialHeight: 600, nextHeight: 100, expectedOverflow: false },
  ])(
    'updates overflow after notes change from $initialHeight to $nextHeight pixels',
    async ({ initialHeight, nextHeight, expectedOverflow }) => {
      const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      height.mockReturnValue(initialHeight)
      const wrapper = mount(ReleaseContent, { props: { html: '<p>Initial notes</p>' } })
      height.mockReturnValue(nextHeight)

      await wrapper.setProps({ html: '<p>Updated notes</p>' })

      expect(wrapper.emitted('overflowChange')?.at(-1)).toEqual([expectedOverflow])
      expect(wrapper.get('.release-content').classes('with-gradient')).toBe(expectedOverflow)
    },
  )

  it('updates overflow when an image finishes loading', async () => {
    const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(100)
    const wrapper = mount(ReleaseContent, {
      props: { html: '<p>Notes</p><img src="/release.png" alt="Release screenshot">' },
    })
    height.mockReturnValue(600)

    await wrapper.get('img').trigger('load')

    expect(wrapper.emitted('overflowChange')?.at(-1)).toEqual([true])
  })

  it('updates overflow when the available width changes', async () => {
    let notifyResize = () => {}
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notifyResize = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(100)
    const wrapper = mount(ReleaseContent, { props: { html: '<p>Notes that wrap on mobile</p>' } })
    height.mockReturnValue(600)

    notifyResize()

    expect(wrapper.emitted('overflowChange')?.at(-1)).toEqual([true])
  })

  it('shows expanded notes in the normal page flow', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(600)
    const wrapper = mount(ReleaseContent, { props: { html: '<p>Long release notes</p>' } })

    await wrapper.setProps({ isExpanded: true })

    const content = wrapper.get<HTMLElement>('.release-content')
    expect(content.element.style.maxHeight).toBe('none')
    expect(content.classes()).toContain('overflow-visible')
    expect(content.classes()).not.toContain('overflow-hidden')
    expect(content.classes()).not.toContain('overflow-y-auto')
    expect(content.classes()).not.toContain('with-gradient')
  })
})
