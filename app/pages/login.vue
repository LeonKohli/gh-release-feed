<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <Card class="mx-4 w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription
          >Sign in to browse releases from your starred repositories.</CardDescription
        >
      </CardHeader>
      <CardContent>
        <div v-if="error" class="mb-4">
          <Alert variant="destructive">
            <Icon name="lucide:circle-alert" class="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>
        </div>
        <Button class="w-full" @click="signInWithGithub">
          <Icon name="lucide:github" class="mr-2 h-4 w-4" />
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
