# StoryFlow Studio

Automated YouTube story video pipeline: script → scenes → images → narration → subtitles → rendered MP4.

## Architecture

```
            ┌──────────────────┐
 Browser →  │  Next.js (web)   │ ─── fast calls (script gen, scene gen, image gen, TTS)
            └──────────────────┘       │
                     │                 ▼
                     │          Supabase Postgres + Storage
                     │                 ▲
                     ▼                 │
               BullMQ queue     ──▶ Worker process (npm run worker)
               (Redis)                 │
                                       ▼
                                FFmpeg render → Supabase Storage
```

- **Web** handles auth, settings, script/scene/image/voice generation inline.
- **Worker** handles the heavy video render via BullMQ so a long render doesn't tie up the HTTP request.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Prisma → Supabase Postgres (schema `storyflow`, all tables prefixed `sf_`)
- Supabase Auth + Storage (`sf-media` bucket, auto-created)
- BullMQ + Redis for background render jobs
- FFmpeg (via `spawn`) for rendering
- OpenAI / Gemini / ElevenLabs — each user brings their own keys in Settings

## Prerequisites

- Node.js 20+
- `ffmpeg` + `ffprobe` on PATH
- Redis — `brew install redis` (macOS), `apt install redis-server` (Ubuntu), or `docker compose up -d`
- A Supabase project (free tier is fine)

## Local run

```bash
# 1. Deps
npm install
npm run db:generate

# 2. Start Redis (pick one)
brew services start redis             # macOS
sudo systemctl enable --now redis-server   # Ubuntu
docker compose up -d                   # Docker

# 3. Push schema (creates storyflow schema + sf_* tables in Supabase)
npx prisma db push

# 4. Run web + worker in two terminals
npm run dev
# in another terminal:
npm run worker
```

Open <http://localhost:3000>, sign up, paste your AI keys under **Settings**, and go.

## Environment

Copy `.env.example` → `.env.local` and fill in:

- **AI provider defaults**: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_*`
  *These are fallbacks — each user overrides with their own keys in Settings.*
- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`
- **Prisma**: `DATABASE_URL` (pooler, port 6543), `DIRECT_URL` (port 5432 for migrations)
- **Redis**: `REDIS_URL` (default `redis://127.0.0.1:6379`)
- **Runtime**: `MEDIA_ROOT` (scratch dir for FFmpeg), `FFMPEG_PATH`

`.env` (used by Prisma CLI and worker) only needs `DATABASE_URL` and `DIRECT_URL`.

## Table layout

Every table lives in the `storyflow` Postgres schema (not `public`) and is prefixed `sf_`:

| Table | Purpose |
|---|---|
| `storyflow.sf_users` | user profile (id = Supabase `auth.users.id`) |
| `storyflow.sf_projects` | story projects |
| `storyflow.sf_scenes` | scene breakdowns |
| `storyflow.sf_assets` | images, audio, video, subtitles |
| `storyflow.sf_render_jobs` | render status + progress |
| `storyflow.sf_settings` | per-user API keys + defaults |

To view in Supabase dashboard: **Table Editor → schema dropdown → storyflow**.

## Queues

| Queue | Used by | Status |
|---|---|---|
| `video-render` | `POST /api/projects/:id/render` | **Active** — fronted by `sf_render_jobs`, polled via `GET /api/render-jobs/:id` |
| `script-generation` | — | Worker ready; route still runs inline |
| `scene-generation` | — | Worker ready; route still runs inline |
| `image-generation` | — | Worker ready; route still runs inline |
| `audio-generation` | — | Worker ready; route still runs inline |

Only `video-render` benefits enough from async to justify the UI polling complexity. Others are ready to be converted later by swapping the route to `queues.xxx.add(...)` instead of calling the service directly.

## EC2 deployment

One box runs web + worker + Redis. Recommended layout:

```bash
# On a fresh Ubuntu 22.04 EC2 instance
sudo apt update && sudo apt install -y nodejs npm redis-server ffmpeg
sudo systemctl enable --now redis-server

git clone <repo> storyflow && cd storyflow
npm install
# Put production values in .env.local
npx prisma generate
npx prisma db push

# Use pm2 (or systemd) to run both processes
sudo npm i -g pm2
pm2 start "npm run build && npm run start" --name storyflow-web
pm2 start "npm run worker" --name storyflow-worker
pm2 save && pm2 startup
```

Put nginx in front for TLS + port 80/443 → 3000.

## Production hardening notes

- Encrypt AI keys in `sf_settings` at rest (currently plaintext)
- Add rate limiting per user on generation endpoints
- Add signed Storage URLs with short TTL for asset downloads (already done for render outputs)
- Move FFmpeg concurrency onto a dedicated worker with more CPU if you need parallel renders
- Turn on Supabase Auth email confirmation in production
