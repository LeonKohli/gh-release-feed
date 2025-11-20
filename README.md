# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Environment Configuration

This app requires GitHub OAuth credentials for authentication. Follow these steps to set up:

### Step 1: Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in the following:
   - **Application name**: e.g., "GH Release Feed"
   - **Homepage URL**: `http://localhost:3000` (for local dev) or your production URL
   - **Authorization callback URL**: `http://localhost:3000/api/auth/github` (for local dev) or `https://yourdomain.com/api/auth/github` (for production)
4. Click **"Register application"**
5. Copy the **Client ID** and generate a **Client Secret** (click "Generate a new client secret")

### Step 2: Create `.env.local` File

Create a `.env.local` file in the project root with the following variables:

```bash
# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret

# Session encryption password (generate a random 32+ character string)
NUXT_SESSION_PASSWORD=your_random_32_character_session_password

# Application URL (must match GitHub OAuth callback URL)
APP_URL=http://localhost:3000
```

### Step 3: Generate Session Password

Generate a secure session password using:

```bash
openssl rand -base64 32
```

Copy the output and use it as your `NUXT_SESSION_PASSWORD` value.

### Important Notes

- The callback URL must match: `{APP_URL}/api/auth/github`
- For local development: `http://localhost:3000/api/auth/github`
- For production: `https://yourdomain.com/api/auth/github`
- The app requests read-only scopes: `read:user`, `user:email`, `read:org`
- Never commit `.env.local` — it's in `.gitignore`

After setting these variables, restart your dev server for the changes to take effect.

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
