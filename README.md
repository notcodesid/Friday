# Friday Agents

Friday now starts as an agent platform, not a script bucket.

## What exists

- A Next.js dashboard for running agents manually
- A reusable run store with local JSON persistence and optional Supabase backing
- A first specialist agent: `Content Distribution Agent`
- Website inspection tooling that can read Framer search indexes when available
- Structured OpenAI Agents SDK output for:
  - product/site profile
  - content pillars
  - per-channel plans
  - drafts
  - experiments
  - next actions

## Stack

- Next.js
- TypeScript
- `@openai/agents`
- `zod`
- optional Supabase persistence

## Environment

Copy `.env.example` to `.env.local` and set:

```bash
ANTHROPIC_API_KEY=...
AI_MODEL=claude-sonnet-4-20250514
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_DEFAULT_SITE_URL=https://www.tryproven.fun/
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_PROJECT_ID=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SECRET_KEY=
```

Supabase is optional. If it is not configured, runs are stored in `data/agent-runs.json`.
If `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, the dashboard enables Supabase Auth magic-link sign-in and the API routes require a valid bearer token from that signed-in browser session.
If Google is enabled as an auth provider in your Supabase project, the same modal also supports `Continue with Google`.

## Run locally

```bash
npm install
npm run dev
```

## Supabase setup

Run the SQL in [`supabase/schema.sql`](/Users/siddharth/projects/Friday/supabase/schema.sql) if you want persistent shared storage.

## Current agent

`Content Distribution Agent`

Input:
- site URL
- selected channels
- optional operator notes

Output:
- inferred site profile
- positioning summary
- content pillars
- channel plans
- drafts
- growth experiments
- next actions

## Next agents to add

1. `SEO / GEO Agent`
2. `Competitor Intel Agent`
3. `Social Reply Agent`
4. `Main CMO Agent` to orchestrate the specialists
