# GitHub Release Feed

Track releases from your starred GitHub repositories. The app uses Nuxt 4, Vue 3, Pinia, Tailwind CSS 4, and shadcn-vue with Reka UI. GitHub OAuth and GraphQL requests run on the server; IndexedDB caches releases in the browser.

Filter by **All**, **Stable**, or **Pre-releases**. The app remembers the release type on this browser and combines it with text search before grouping releases. Drafts are excluded. Search includes repository descriptions, owners, release names, tags, and release notes.

Hover over a repository name for a preview, or use its **About** button with a mouse, keyboard, or touch screen. The preview includes the description, language, stars, forks, archive status, license, and links. Expand long release notes to read them in the page without a separate scroll area.

The feed covers the last three months. It fetches a limited recent history per repository (three releases initially and up to two additional batches of three by default), plus GitHub's latest stable release when it falls within that period. Follow the repository link for its full history. GitHub's prerelease flag determines the release type; version-name patterns are not used.

## Run locally

Use the Bun version in `packageManager` and a Node version allowed by `engines` in `package.json`.

```bash
bun install --frozen-lockfile
cp .env.example .env.local
openssl rand -hex 32
```

Fill in `.env.local` with your GitHub OAuth app credentials and use the generated value for `NUXT_SESSION_PASSWORD`. Register `http://localhost:3000/api/auth/github` as the OAuth callback URL. Keep existing local environment files when setting up an existing checkout.

```bash
bun run dev --dotenv .env.local
```

Open [localhost:3000](http://localhost:3000). For another origin, update the GitHub callback URL. `nuxt-auth-utils` derives the redirect URL from the request; `APP_URL` is not read by this project.

## Check changes

```bash
bun run check
bun run build
```

`check` runs the formatter check, linting, type checking, and tests. CI runs these commands after a frozen install on pull requests and pushes to `master` or `main`.

| Command              | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `bun run lint`       | Oxlint with type-aware rules, then ESLint for Vue templates |
| `bun run lint:fix`   | Apply automatic lint fixes                                  |
| `bun run fmt`        | Format files and sort Tailwind classes                      |
| `bun run fmt:check`  | Check formatting without writing files                      |
| `bun run typecheck`  | Check the Nuxt app and server with vue-tsc                  |
| `bun run test`       | Run Vitest once                                             |
| `bun run test:watch` | Run Vitest in watch mode                                    |

Tests live in `tests/`. They cover release filters, grouping, repository pagination and preview metadata, latest-stable fallback, search input updates, and release-note expansion after content changes. They use Vue Test Utils and Happy DOM without GitHub credentials or network requests. Add Nuxt test utils when a test needs the Nuxt runtime.

TypeScript stays on 6.0.x because the installed Vue and ESLint tooling does not support TypeScript 7 yet.

## Update dependencies and components

```bash
bun outdated
bun update --latest
```

Review major-version migration notes, then run the checks above. shadcn components are source files, so updating `shadcn-nuxt` alone does not update them. Use the [shadcn-vue CLI](https://shadcn-vue.com/docs/cli) to inspect upstream changes:

```bash
bunx --bun shadcn-vue@latest diff
```

Installed components live in `app/components/ui/`, including the feed's `toggle-group`, `hover-card`, `popover`, `input-group`, and `empty` components. Review local customizations before using `add <component> --overwrite`. Keep aliases and the New York style in `components.json`; theme tokens live in `app/assets/css/tailwind.css`.

The lint and format setup follows the local `copy4ai-page` project; CI follows `ccurio`. This repo uses correctness rules rather than importing Copy4AI's design restrictions.

## Set up agent skills

`AGENTS.md` contains shared project instructions; `CLAUDE.md` imports it. The official shadcn-vue skill is installed locally for Codex and Claude Code. `skills-lock.json` records its upstream source and hash; skill files and Claude settings stay ignored.

To install the skill in another checkout:

```bash
bunx --bun skills@latest add unovue/shadcn-vue --skill shadcn-vue --agent codex claude-code --yes
```

To update the local installation:

```bash
bunx --bun skills@latest update shadcn-vue --project --yes
```

Keep imported skill files unchanged and review updates to `skills-lock.json`.

## Run a production build

```bash
bun run build
bun run .output/server/index.mjs
```

The production Nitro preset is Bun. Supply OAuth credentials and the session password through the server environment. Nuxt's production server does not load `.env` files automatically; use `NUXT_OAUTH_GITHUB_CLIENT_ID` and `NUXT_OAUTH_GITHUB_CLIENT_SECRET` for runtime overrides.

## Deploy

The production app runs at [git-release.leonkohli.dev](https://git-release.leonkohli.dev) on Dokploy, application `web-gitrelease-yiot7o`. Pushes to `master` trigger a Railpack build. The GitHub repository's Vercel homepage is obsolete.

Dokploy installs with `bun install --frozen-lockfile --ignore-scripts`, builds with `bun --bun run build`, and starts with `bun --bun run .output/server/index.mjs`. Keep OAuth credentials and the session password in the existing Dokploy environment. Check the deployment status and the public login page after a push.

The feed uses GitHub's GraphQL release metadata for stable and prerelease filters. The existing Atom endpoints remain available, but the feed does not infer release types from version names.
