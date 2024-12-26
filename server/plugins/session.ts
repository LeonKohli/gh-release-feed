export default defineNitroPlugin(() => {
    sessionHooks.hook('fetch', async (session, event) => {
        if (!session.user?.email) {
            await clearUserSession(event)
            throw createError({ statusCode: 401, message: 'Not authenticated' })
        }
    })
})
