# ASSETLY — Digital Resource Library

## Setup

1. Extract the project.
2. Open the project folder in VS Code.
3. Create a `.env` file in the project root using `.env.example` as a guide.
4. Add the Supabase Project URL and publishable/anon key from the **same Supabase project**.
5. In PowerShell, run:

```powershell
npm install
npm run dev
```

## Supabase environment

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Never put a Supabase `service_role` or secret key in a Vite frontend `.env` file.

## Authentication reliability changes

- The app now initializes its React session state from Supabase's `INITIAL_SESSION` auth event instead of separately calling `getSession()` at startup.
- Auth listener callbacks do not await Supabase queries.
- The Supabase fetch wrapper treats temporary 429, 408, and 409 refresh responses as retryable network failures. This works around a currently reported Supabase Auth behavior where an expired local session can be cleared after a rate-limited refresh request.
- Keep only one ASSETLY tab open while testing sign-in. Multiple tabs/devices can race to refresh the same one-time refresh token.
- This is a mitigation for the observed refresh failure, not a guarantee against project-wide Auth rate limits. If 429 continues, inspect Supabase Auth rate-limit usage and wait for the limit window to recover.

## Existing database

The existing `supabase/schema.sql` is retained. Do not rerun the schema or reset your Supabase project just to apply this frontend update.

## Branding

- `public/assets/assetly-logo.png` — ASSETLY wordmark
- `public/assets/assetly-mark.png` — browser favicon / app icon

The redesign keeps the existing resource, auth, admin, upload, edit, delete, and download flows.


## Resource action types upgrade

ASSETLY supports three resource actions:

- **Download** — upload a file to Supabase Storage.
- **Visit** — send visitors to an external website or app link.
- **Copy** — show text such as prompts, commands, or templates with a copy button.

If your Supabase database already exists, run `supabase/migrations/20261122_resource_action_types.sql` once in **Supabase Dashboard → SQL Editor** before publishing the upgraded app. This migration adds the action fields and makes the existing file columns nullable without deleting or recreating any existing resource rows.

For a brand-new database, the updated `supabase/schema.sql` already includes these columns.
