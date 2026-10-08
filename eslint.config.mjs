import tsParser from '@typescript-eslint/parser'
import { defineConfig } from 'eslint/config'
import vue from 'eslint-plugin-vue'
import * as vueApi from 'vue'
import vueParser from 'vue-eslint-parser'

const vueGlobals = Object.fromEntries(Object.keys(vueApi).map((name) => [name, 'readonly']))

export default defineConfig([
  { ignores: ['.nuxt/**', '.output/**', '.agents/**', '.claude/**', '.playwright-cli/**'] },
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tsParser },
      globals: vueGlobals,
    },
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
])
