# StoryFlow Studio

StoryFlow Studio is a production-oriented MVP scaffold for automated YouTube story video creation. It includes a Next.js App Router frontend, modular backend services, Prisma/PostgreSQL models, BullMQ worker scaffolding, OpenAI and ElevenLabs integrations, and an FFmpeg-based render pipeline foundation.

## Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- shadcn-style UI components
- Prisma + PostgreSQL
- BullMQ + Redis
- FFmpeg render pipeline helpers
- Zustand editor state

## Features in this MVP scaffold

- Create projects from manual script input or AI-assisted script generation
- Script chat and rewrite UI scaffolding
- Structured scene generation JSON flow
- Image generation service abstraction with retries
- ElevenLabs TTS integration through backend routes only
- Manual audio upload and in-browser recording UI scaffolding
- Subtitle chunking and SRT export utilities
- Video editor and export dashboard structure
- Background worker entrypoint for long-running jobs

## Folder structure

```txt
app/
  api/
  exports/
  image-studio/
  projects/new/
  scene-studio/
  script-studio/
  settings/
  video-editor/
  voice-studio/
components/
  dashboard/
  forms/
  layout/
  studio/
  ui/
lib/
  ffmpeg/
  prompts/
  services/
  store/
prisma/
types/
workers/
```

## Environment setup

1. Copy `.env.example` to `.env.local`.
2. Fill in your real secrets only in `.env.local`.
3. Start PostgreSQL and Redis locally.
4. Ensure `ffmpeg` is installed and accessible in your shell.

Required variables:

```bash
OPENAI_API_KEY=
GEMINI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_MODEL=
DATABASE_URL=
REDIS_URL=
MEDIA_ROOT=
FFMPEG_PATH=
```

## Local run instructions

Start local infrastructure:

```bash
docker compose up -d
```

This brings up:

- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- Adminer on `http://localhost:8080`

Adminer login:

- System: `PostgreSQL`
- Server: `postgres`
- Username: `appuser`
- Password: `secret123`
- Database: `appdb`

Then run the app:

```bash
npm install
npm run db:generate
npx prisma db push
npm run dev
```

Run workers in a second terminal:

```bash
npm run worker
```

## Production hardening notes

- Add authentication before exposing project/user routes publicly.
- Replace the fallback demo user ID with real authenticated session handling.
- Persist uploaded audio, images, and renders in object storage such as S3/R2.
- Expand FFmpeg filter graph generation for true timeline transitions, per-scene pan/zoom, and layered music mixing.
- Add durable render state updates, retries, cancellation, and idempotency keys for jobs.
- Validate all API inputs with Zod on route boundaries.
- Add waveform generation, voice preview caching, and audio normalization.
- Add signed asset URLs and access control for downloads.
- Add observability, rate limiting, and audit logging around provider APIs.
- Consider splitting image and render work into dedicated compute workers for scale.

## Prompt design

All OpenAI prompts live in `lib/prompts/` and all model outputs are expected to be structured JSON. This keeps prompt logic isolated and production-friendly.

## Notes

- Secrets are never referenced in client components.
- Provider calls go through backend services and API routes.
- The UI includes advanced editing surfaces in MVP form so the workflow is visible end to end.
- Scene generation and image generation can be powered by Gemini when `GEMINI_API_KEY` is configured.
