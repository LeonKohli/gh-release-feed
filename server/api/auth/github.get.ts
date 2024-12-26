export default defineOAuthGitHubEventHandler({
  config: {
    emailRequired: true,
    scope: ['read:user', 'user:email', 'read:org', 'repo']
  },
  async onSuccess(event, { user, tokens }) {
    if (!user?.email) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Email is required'
      })
    }

    const id = user.id.toString()
    await setUserSession(event, {
      user: {
        id,
        userId: id,
        email: user.email,
        name: user.name || user.login,
        avatarUrl: user.avatar_url,
        accessToken: tokens.access_token
      },
      loggedInAt: new Date()
    })

    const session = await getUserSession(event)
    console.log('GitHub OAuth success - session:', session)
    return sendRedirect(event, '/')
  },
  onError(event, error) {
    console.error('GitHub OAuth error:', error)
    return sendRedirect(event, '/login?error=github_oauth_failed')
  }
})