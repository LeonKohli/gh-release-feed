import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  future: {
    compatibilityVersion: 4
  },
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  modules: [
    '@pinia/nuxt',
    '@nuxt/icon',
    'nuxt-auth-utils',
    '@nuxt/image',
    '@vueuse/nuxt',
    '@nuxtjs/color-mode',
    'shadcn-nuxt',
  ],
  css: ['~/assets/css/tailwind.css'],
  colorMode: {
    classPrefix: '',
    classSuffix: ''
  },
  shadcn: {
    prefix: '',
    componentDir: '~/components/ui'
  },
  runtimeConfig: {
    oauth: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      }
    }
  },
  app: {
    head: {
      script: process.env.NODE_ENV === 'production' ? [
        {
          src: 'https://um.web.leonkohli.de/script.js',
          defer: true,
          'data-website-id': '09e0d0fa-3476-43e7-ba6c-16b3d636d76d'
        }
      ] : []
    }
  },
  vite: {
    plugins: [
      tailwindcss(),
    ],
  },
})