// Fetch releases via Atom feeds with throttling
// Atom feeds are static XML files but GitHub still rate-limits rapid requests

import { parseStringPromise } from 'xml2js'

interface AtomRelease {
  id: string
  title: string
  link: string
  updated: string
  content: string
  author: string
}

interface AtomFeedResult {
  repo: string
  owner: string
  releases: AtomRelease[]
  error?: string
}

// Controlled concurrency helper - limits parallel requests
async function processWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
  delayMs: number
): Promise<R[]> {
  const results: R[] = []

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)

    // Add delay between batches to avoid rate limiting
    if (i + concurrency < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return results
}

async function fetchAtomFeed(
  owner: string,
  name: string,
  accessToken: string,
  errors: Array<{ repo: string; error: string }>
): Promise<AtomFeedResult> {
  const url = `https://github.com/${owner}/${name}/releases.atom`

  try {
    const response = await $fetch<string>(url, {
      headers: {
        'Accept': 'application/atom+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; gh-release-feed/1.0)',
        'Authorization': `token ${accessToken}`
      },
      timeout: 15000,
      responseType: 'text',
      retry: 2,
      retryDelay: 1000
    })

    // Parse the Atom XML
    const parsed = await parseStringPromise(response, { explicitArray: false })

    if (!parsed?.feed?.entry) {
      return {
        repo: name,
        owner,
        releases: []
      }
    }

    // Normalize entries to array
    const entries = Array.isArray(parsed.feed.entry)
      ? parsed.feed.entry
      : [parsed.feed.entry]

    const releases: AtomRelease[] = entries.map((entry: Record<string, unknown>) => ({
      id: (entry.id as string) || '',
      title: (entry.title as string) || '',
      link: typeof entry.link === 'object' && entry.link !== null
        ? ((entry.link as Record<string, unknown>)['$'] as Record<string, unknown>)?.href as string || ''
        : '',
      updated: (entry.updated as string) || '',
      content: typeof entry.content === 'object' && entry.content !== null
        ? ((entry.content as Record<string, unknown>)['_'] as string) || ''
        : (entry.content as string) || '',
      author: typeof entry.author === 'object' && entry.author !== null
        ? ((entry.author as Record<string, unknown>).name as string) || ''
        : ''
    }))

    return {
      repo: name,
      owner,
      releases
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    errors.push({ repo: `${owner}/${name}`, error: message })
    return {
      repo: name,
      owner,
      releases: [],
      error: message
    }
  }
}

export default defineEventHandler(async (event) => {
  const { user, accessToken } = await requireGithubAuth(event)

  const body = await readBody<{ repos?: Array<{ owner: string; name: string }> }>(event)
  const repos = body?.repos ?? []

  if (repos.length === 0) {
    return { results: [], errors: [] }
  }

  if (repos.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Too many repos. Max 100 per request.' })
  }

  const errors: Array<{ repo: string; error: string }> = []

  // Process with higher concurrency since we're authenticated
  // 20 concurrent requests with minimal delay
  const results = await processWithConcurrency(
    repos,
    ({ owner, name }) => fetchAtomFeed(owner, name, accessToken, errors),
    20,  // concurrency limit (authenticated requests are less restricted)
    100  // minimal delay between batches
  )

  console.info(`[gh][atom] Fetched ${repos.length} atom feeds for user=${user.id}, errors=${errors.length}`)

  return { results, errors }
})
