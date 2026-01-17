// GitHub API type definitions - Single source of truth for all GitHub types

// Rate limit information from GitHub GraphQL API
export interface RateLimit {
  cost: number
  limit: number
  remaining: number
  resetAt: string
  used: number
}

// Simplified rate limit info for client-side use
export interface RateLimitInfo {
  cost: number
  remaining: number
  resetAt: string
}

// Language node from GraphQL
export interface LanguageNode {
  id: string
  name: string
}

// Owner information
export interface RepositoryOwner {
  login: string
  avatarUrl: string
  url: string
}

// Release node from GraphQL
export interface ReleaseNode {
  id: string
  isDraft: boolean
  isPrerelease: boolean
  name: string | null
  tagName: string
  publishedAt: string
  updatedAt: string
  url: string
  descriptionHTML?: string | null
}

// Repository node from GraphQL
export interface RepositoryNode {
  id: string
  name: string
  url: string
  description: string | null
  primaryLanguage: LanguageNode | null
  owner: RepositoryOwner
  stargazerCount: number
  languages: {
    totalCount: number
    edges: Array<{ node: LanguageNode }>
  }
  licenseInfo: { spdxId: string } | null
  releases: {
    totalCount: number
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
    edges: Array<{ node: ReleaseNode }>
  }
}

// GraphQL response for starred repositories (releases.get.ts)
export interface StarredRepositoriesResponse {
  viewer: {
    starredRepositories: {
      totalCount?: number
      pageInfo: {
        endCursor: string | null
        hasNextPage: boolean
      }
      edges: Array<{ node: RepositoryNode }>
    }
  }
  rateLimit: RateLimit
}

// GraphQL response for repository releases (repo-releases.post.ts)
export interface RepositoryReleasesResponse {
  repository: RepositoryNode | null
  rateLimit: RateLimit
}

// GraphQL response for release details by ID (release-details.post.ts)
export interface GraphQLNodesResponse {
  nodes: Array<null | { __typename?: string; id?: string; descriptionHTML?: string }>
  rateLimit: RateLimit
}

// Cache entry types
export interface CacheEntry<T> {
  data: T
  expiresAt: number
}

export interface DetailsCacheEntry {
  id: string
  descriptionHTML: string
  expiresAt: number
}

// GitHub error structure
export interface GithubError {
  statusCode: number
  statusMessage: string
  data?: unknown
}

// Legacy alias for backwards compatibility
export type GithubRelease = ReleaseNode & {
  repository?: Omit<RepositoryNode, 'releases'>
}

export interface GithubAPIResponse {
  data?: unknown
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
  onResponseError?: (context: { response: Response }) => void
}
