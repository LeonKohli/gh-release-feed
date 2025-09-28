# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Development Server
```bash
npm run dev     # Start Nuxt development server on localhost:3000
```

### Building and Testing
```bash
npm run build       # Build application for production
npm run preview     # Preview production build locally
npm run typecheck   # Type-check Vue components and TypeScript files
```

## Architecture Overview

This is a Nuxt 4 application that creates a GitHub Release Feed, allowing users to track releases from their starred repositories.

### Key Technologies
- **Nuxt 4** - Vue.js framework with v4.1+ compatibility mode
- **Vue 3** - Composition API with `<script setup>` syntax
- **Pinia** - State management for releases and GitHub data
- **Tailwind CSS v4** - Styling via `@tailwindcss/vite` plugin
- **shadcn-vue** - UI components in `/app/components/ui/`
- **IndexedDB** - Client-side caching via `idb` library

### Core Features
- OAuth authentication via GitHub (handled by `nuxt-auth-utils`)
- Fetches releases from starred repositories using GitHub GraphQL API
- Caches release data in IndexedDB with 5-minute staleness threshold
- Batch processing of repositories (50 per API call, 5 parallel)
- Auto-refresh when data becomes stale

### Data Flow
1. User authenticates via GitHub OAuth (`/login` → `/api/auth/github`)
2. `useGithub` composable fetches starred repositories and their releases via GraphQL
3. Releases are cached in IndexedDB with descriptions stored separately
4. `useReleaseGroups` composable groups releases by repository
5. UI displays releases with infinite scroll pagination

### State Management
- **useGithubStore (Pinia)**: Manages GitHub releases, loading states, rate limits, and caching
- **useUserSession**: Handles authentication state and session management
- **IndexedDB Stores**:
  - `releases`: Full release objects with metadata
  - `descriptions`: Large HTML descriptions cached separately
  - `metadata`: Last fetch timestamps and ETags

### Environment Variables
Create a `.env` file with:
```
GITHUB_CLIENT_ID=your_github_oauth_app_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_secret
NUXT_SESSION_PASSWORD=random_32_character_string
```

## Important Implementation Notes

- Always use absolute paths when working with files
- The app directory structure follows Nuxt 4's app/ convention
- UI components use shadcn-vue without the 'cn' prefix
- Tailwind configuration is handled via Vite plugin, not PostCSS
- Rate limit handling includes exponential backoff and retry logic
- Background loading allows UI interaction while fetching more data