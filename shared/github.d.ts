// GitHub API type definitions

export interface GithubError {
  statusCode: number
  statusMessage: string
  data?: any
}

export interface RateLimitInfo {
  cost: number
  remaining: number
  resetAt: string
}

export interface GithubRelease {
  id: string
  isDraft: boolean
  isPrerelease: boolean
  name: string | null
  tagName: string
  publishedAt: string
  updatedAt: string
  url: string
  descriptionHTML: string
  repository?: {
    name: string
    url: string
    description: string | null
    owner: {
      login: string
      avatarUrl: string
      url: string
    }
    primaryLanguage: {
      id: string
      name: string
    } | null
    languages: {
      edges: Array<{
        node: {
          id: string
          name: string
        }
      }>
    }
    licenseInfo: {
      spdxId: string
    } | null
    stargazerCount: number
  }
}

export interface GithubAPIResponse {
  data?: any
  releases?: GithubRelease[]
  rateLimit: RateLimitInfo
  pageInfo?: {
    endCursor: string | null
    hasNextPage: boolean
  }
}

export interface FetchOptions {
  retry?: number
  retryDelay?: number
  headers?: Record<string, string>
  signal?: AbortSignal
  onResponseError?: (context: { response: any }) => void
}