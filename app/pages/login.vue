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
            <AlertCircleIcon class="w-4 h-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>
        </div>
        <Button class="w-full" @click="signInWithGithub">
          <GithubIcon class="w-4 h-4 mr-2" />
          Continue with GitHub
        </Button>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { GithubIcon, AlertCircleIcon } from 'lucide-vue-next'

const route = useRoute()
const error = computed(() => route.query.error as string)

function signInWithGithub() {
  navigateTo('api/auth/github', { external: true })
}
</script> 