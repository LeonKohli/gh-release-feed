# gh-release-feed

Nuxt 4 app that tracks releases from a user's starred GitHub repositories.

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Dev server at http://localhost:3000
bun run build        # Production build
bun run preview      # Preview production build
bun run typecheck    # vue-tsc, no emit
bun run lint         # Type-aware Oxlint and Vue ESLint
bun run fmt          # Oxfmt with Tailwind class sorting
bun run test         # Vitest, no GitHub credentials required
bun run check        # Format check, lint, typecheck, tests
```

## Stack

- **Nuxt 4** (`^4.6.0`) with v4 compatibility mode
- **Vue 3** — Composition API, `<script setup>`
- **Pinia 4** — releases and GitHub state
- **Tailwind CSS v4** via the `@tailwindcss/vite` plugin, not PostCSS
- **shadcn-vue / shadcn-nuxt** (`2.8.2`) with **Reka UI** — components in `app/components/ui/`, without a component prefix
- **@octokit/core** with `@octokit/plugin-throttling`
- **IndexedDB** via `idb` for client-side caching
- **nuxt-auth-utils** for GitHub OAuth

## Project Structure

- `app/` — Nuxt app code
  - `pages/` — file-based routing, kebab-case directories, `index.vue` for roots
  - `components/` — UI components (`AppNavbar.vue`, `components/ui/*`)
  - `composables/` — reusable logic (`useGithub.ts` with Pinia store + IndexedDB cache)
  - `assets/` — styles, Tailwind at `app/assets/css/tailwind.css`
  - `plugins/` — client/SSR plugins (`ssr-width.ts`)
- `server/` — API handlers, middleware, session plugins (`server/api/github/releases.get.ts`, `server/plugins/session.ts`)
- `shared/` — shared type declarations
- `public/` — static assets
- `nuxt.config.ts` — Nuxt, modules, runtime config

## Architecture

### Data flow

1. User authenticates via GitHub OAuth (`/login` → `/api/auth/github`)
2. Server-side GraphQL proxy at `/api/github/releases` handles GitHub API calls
3. `useGithub` composable manages client-side fetching and caching
4. Releases cached in IndexedDB, descriptions stored separately
5. `useReleaseGroups` groups releases by repository within 2-hour windows
6. UI renders with infinite scroll pagination (`useElementVisibility`)

### State

- **useGithubStore (Pinia)** — releases, loading states, rate limits, caching
- **useUserSession** — auth state and session
- **IndexedDB stores** — `releases` (full objects with metadata), `descriptions` (large HTML, separate for performance), `metadata` (fetch timestamps and ETags)

### Server GraphQL proxy — `server/api/github/releases.get.ts`

Exponential backoff for transient errors, rate limiting via `@octokit/plugin-throttling`, 5-minute cache per user. Handles 401 (auth), 403 (forbidden), 429 (rate limit), and 5xx.

### Release grouping — `app/composables/useReleaseGroups.ts`

Groups releases from the same repository within 2-hour windows. Memoized with cache invalidation. Date-based sort, repository name as secondary key.

## Performance and rate limits

Query shape: 50 repositories per GraphQL query, 5 releases per repository, top 3 languages per repository. Light query mode fetches releases without HTML descriptions for pagination.

Processing: 20 repositories in parallel. IndexedDB staleness threshold 5 minutes, auto-refresh when stale. Up to 3 retries for rate-limited requests with a 3x backoff multiplier on 429.

Adaptive throttle by remaining rate limit:

| Remaining | Delay |
|---|---|
| < 500 | 2000 ms |
| < 1000 | 1000 ms |
| < 2000 | 500 ms |
| otherwise | 200 ms |

API cost per session is tracked and displayed.

## Environment

Required in `.env.local`; start Nuxt with `bun run dev --dotenv .env.local`:

```
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
NUXT_SESSION_PASSWORD=      # random 32-character string
```

Register `http://localhost:3000/api/auth/github` as the local OAuth callback. The redirect URL follows the request origin; `APP_URL` is not read. Never commit real secrets and keep `.env.example` sanitized. Production runtime overrides use `NUXT_OAUTH_GITHUB_CLIENT_ID` and `NUXT_OAUTH_GITHUB_CLIENT_SECRET`.

## Coding style

TypeScript with Vue 3 `<script setup>` and Composition API. Two-space indentation, single quotes, no semicolons in Vue/TS unless required. Components PascalCase in `app/components`, colocated with usage where reasonable. Composables `useX.ts`. Server routes HTTP-suffixed (`*.get.ts`, `*.post.ts`).

## Testing

Vitest with `@vue/test-utils` and Happy DOM runs `tests/*.spec.ts`. Cover observable behavior and edge cases. Add Nuxt test utils only when a test needs the Nuxt runtime. Run `bun run check` and `bun run build` before reporting changes complete.

## Development tooling and skills

Oxlint checks script correctness with type-aware rules; ESLint checks Vue templates. Oxfmt owns formatting and Tailwind class order. Run `bun run lint:fix` and `bun run fmt` for automatic fixes. Keep TypeScript on 6.0.x until vue-tsc and the ESLint parser support TypeScript 7.

For shadcn component changes, read `.agents/skills/shadcn-vue/SKILL.md` when installed. See README.md for installation and updates. Keep upstream skill files unchanged; `skills-lock.json` tracks their source. Inspect registry diffs before overwriting local components and preserve theme tokens in `app/assets/css/tailwind.css`.

## Commits and PRs

Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`). Branches `feat/short-title`, `fix/issue-123`. PRs need a clear description, linked issues, before/after screenshots for UI, and notes on env or config changes. `bun run typecheck` and a local build must pass.

## Implementation notes

- Consult Context7 for current library docs — `resolve-library-id` then `query-docs`.
- Directory layout follows Nuxt 4's `app/` convention.
- Use `v-memo` for expensive re-renders in release cards.
- Large HTML descriptions live in their own IndexedDB store to keep reads fast.
- Background loading keeps the UI interactive while more data arrives.
