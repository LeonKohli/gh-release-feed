<template>
  <div>
    <NuxtLoadingIndicator />
    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
const { loggedIn } = useUserSession()

// Redirect to login if not authenticated
watchEffect(() => {
  const route = useRoute()
  if (!loggedIn.value && route.path !== '/login') {
    navigateTo('/login')
  }
})
</script>
