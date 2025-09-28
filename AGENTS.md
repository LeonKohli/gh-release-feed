# Repository Guidelines

## Project Structure & Module Organization
- app/: Nuxt app code.
  - pages/: Route files (e.g., app/pages/index.vue).
  - components/: UI components (e.g., AppNavbar.vue, components/ui/*).
  - composables/: Reusable logic (e.g., useGithub.ts with Pinia store + IndexedDB cache).
  - assets/: Styles (Tailwind at app/assets/css/tailwind.css).
  - plugins/: Client/SSR plugins (e.g., ssr-width.ts).
- server/: API handlers, middleware, and session plugins (e.g., server/api/github/releases.get.ts, server/plugins/session.ts).
- shared/: Shared type declarations.
- public/: Static assets.
- nuxt.config.ts: Nuxt, modules, and runtime config.

## Build, Test, and Development Commands
- Install deps: `bun install` (or `npm install`).
- Dev server: `bun run dev` (Nuxt at http://localhost:3000).
- Production build: `bun run build`; preview: `bun run preview`.
- Type checks: `bun run typecheck` (vue-tsc, no emit).

## Coding Style & Naming Conventions
- Language: TypeScript + Vue 3 `<script setup>` and Composition API.
- Indentation: 2 spaces; prefer single quotes; no semicolons in Vue/TS unless required.
- Components: PascalCase in `app/components`; colocate small components with usage when reasonable.
- Pages: file-based routing in `app/pages` (kebab-case directories, `index.vue` for roots).
- Composables: `useX.ts` (e.g., `useGithub.ts`).
- Server routes: HTTP-suffixed files (e.g., `*.get.ts`, `*.post.ts`).

## Testing Guidelines
- No test runner is configured yet. If adding tests:
  - Use Vitest + @vue/test-utils and Nuxt test utils.
  - Place specs next to source or under `tests/` using `*.spec.ts`.
  - Cover composables and server handlers; aim for meaningful coverage on data flow and edge cases.

## Commit & Pull Request Guidelines
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:` (see `git log`).
- Branch naming: `feat/short-title`, `fix/issue-123`, etc.
- PRs: clear description, linked issues, before/after screenshots for UI, and notes on env/config changes. Ensure `bun run typecheck` and a local build pass.

## Security & Configuration Tips
- Required env vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NUXT_SESSION_PASSWORD`, `APP_URL`.
- Do not commit real secrets. Use `.env.local`; keep a sanitized `.env.example` up to date.
- GitHub OAuth callback must match `APP_URL`; server handler uses Octokit with throttling and private caching.
