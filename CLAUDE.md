# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
bun run dev         # Start Nuxt development server on localhost:3000
bun run build       # Build application for production
bun run preview     # Preview production build locally
bun run typecheck   # Type-check Vue components and TypeScript files
bun install         # Install dependencies
```

## Architecture Overview

This is a Nuxt 4 application that creates a GitHub Release Feed, allowing users to track releases from their starred repositories.

### Key Technologies
- **Nuxt 4** (`^4.1.2`) - Vue.js framework with v4.1+ compatibility mode
- **Vue 3** - Composition API with `<script setup>` syntax
- **Pinia** (`^3.0.3`) - State management for releases and GitHub data
- **Tailwind CSS v4** (`^4.1.13`) - Styling via `@tailwindcss/vite` plugin
- **shadcn-vue** (`2.2.0`) - UI components in `/app/components/ui/`
- **@octokit/core** (`^7.0.4`) with throttling plugin - GitHub API client
- **IndexedDB** - Client-side caching via `idb` (`^8.0.3`) library

### Core Features
- OAuth authentication via GitHub (handled by `nuxt-auth-utils`)
- Fetches releases from starred repositories using GitHub GraphQL API
- Caches release data in IndexedDB with 5-minute staleness threshold
- Optimized batch processing (50 repos per GraphQL query, 20 parallel client-side processing)
- Auto-refresh when data becomes stale
- Infinite scroll pagination with `useElementVisibility`
- Adaptive throttling based on GitHub API rate limits

### Data Flow
1. User authenticates via GitHub OAuth (`/login` → `/api/auth/github`)
2. Server-side GraphQL proxy at `/api/github/releases` handles GitHub API calls
3. `useGithub` composable manages client-side data fetching and caching
4. Releases are cached in IndexedDB with descriptions stored separately
5. `useReleaseGroups` composable groups releases by repository (2-hour time window)
6. UI displays releases with infinite scroll pagination

### State Management
- **useGithubStore (Pinia)**: Core state for releases, loading states, rate limits, and caching
- **useUserSession**: Authentication state and session management
- **IndexedDB Stores**:
  - `releases`: Full release objects with metadata
  - `descriptions`: Large HTML descriptions (separate for performance)
  - `metadata`: Last fetch timestamps and ETags for cache management

### API Implementation Details

#### Server-side GraphQL Proxy (`/server/api/github/releases.get.ts`)
- Implements exponential backoff retry logic for transient errors
- Handles rate limiting with `@octokit/plugin-throttling`
- 60-second server-side cache per user
- Error handling for 401 (auth), 403 (forbidden), 429 (rate limit), and 5xx errors

#### Release Grouping (`/app/composables/useReleaseGroups.ts`)
- Groups releases from same repository within 2-hour windows
- Memoized computation with proper cache invalidation
- Date-based sorting with repository name as secondary sort

### Environment Variables
Create a `.env` file with:
```
GITHUB_CLIENT_ID=your_github_oauth_app_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_secret
NUXT_SESSION_PASSWORD=random_32_character_string
APP_URL=http://localhost:3000  # Required for OAuth callback
```

## Performance Optimizations

### API Query Optimization
- **Reduced batch size**: 50 repositories per GraphQL query (down from 100) to reduce API costs
- **Fewer releases per repo**: 5 releases per repository (down from 10) for faster initial load
- **Reduced language data**: Only top 3 languages per repo (down from 5)
- **Light query mode**: Option to fetch releases without HTML descriptions for pagination

### Processing Optimizations
- **Increased parallelization**: 20 repositories processed in parallel (up from 5)
- **Adaptive throttling**: Dynamic delays based on remaining API rate limit
- **Extended server cache**: 5-minute cache duration (up from 60 seconds)
- **Aggressive retry strategy**: Up to 3 retries for rate-limited requests (up from 1)

### Rate Limit Management
- **Dynamic delays**: 200ms-2000ms delays based on rate limit status:
  - < 500 remaining: 2000ms delay
  - < 1000 remaining: 1000ms delay
  - < 2000 remaining: 500ms delay
  - Otherwise: 200ms delay
- **Exponential backoff**: 3x delay multiplier for 429 errors
- **Cost tracking**: Monitor and display API cost per session

## Important Implementation Notes

- Always consult Context7 for up-to-date library documentation using `mcp__context7__resolve-library-id` and `mcp__context7__get-library-docs`
- The app directory structure follows Nuxt 4's app/ convention
- UI components use shadcn-vue without the 'cn' prefix
- Tailwind configuration is handled via Vite plugin, not PostCSS
- Rate limit handling includes exponential backoff and retry logic
- Background loading allows UI interaction while fetching more data
- Use `v-memo` for optimizing expensive re-renders in release cards
- Separate storage for large HTML descriptions to improve IndexedDB performance