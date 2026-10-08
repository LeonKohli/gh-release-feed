import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Input from '../app/components/ui/input/Input.vue'

describe('Input', () => {
  it('emits the search text typed by the user', async () => {
    const wrapper = mount(Input, { props: { modelValue: '' } })

    await wrapper.get('input').setValue('nuxt')

    expect(wrapper.emitted('update:modelValue')).toEqual([['nuxt']])
    wrapper.unmount()
  })

  it('updates the displayed value when the search is cleared externally', async () => {
    const wrapper = mount(Input, { props: { modelValue: 'nuxt' } })

    await wrapper.setProps({ modelValue: '' })

    expect(wrapper.get('input').element.value).toBe('')
    wrapper.unmount()
  })
})
