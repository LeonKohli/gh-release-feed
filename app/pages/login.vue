<template>
  <div class="flex items-center justify-center min-h-screen bg-background">
    <Card class="w-full max-w-md mx-4">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Choose your sign in method</CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="error" class="mb-4">
          <Alert variant="destructive">
            <Icon name="mdi:alert-circle" class="w-4 h-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>
        </div>
        <Button class="w-full" @click="signInWithGithub">
          <Icon name="mdi:github" class="w-4 h-4 mr-2" />
          Continue with GitHub
        </Button>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const error = computed(() => route.query.error as string)

function signInWithGithub() {
  navigateTo('api/auth/github', { external: true })
}
</script>