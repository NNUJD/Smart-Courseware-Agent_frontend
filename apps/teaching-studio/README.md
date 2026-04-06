This app is being used as a frontend shell for a teaching-content studio.

Backend implementation can be owned separately. The integration contract lives
in `API_CONTRACT.md`.

## Getting Started

This app is part of the monorepo and should use the workspace dependencies from
the repository root.

Requirements:

- Node.js `>= 24`
- pnpm `10.x` via Corepack

Set your backend address in `.env.local`:

```env
TEACHING_BACKEND_BASE_URL=http://127.0.0.1:8000
TEACHING_BACKEND_USER_ID=teacher-001

# Optional: allow preview/export routes to read generated files directly
# TEACHING_BACKEND_ARTIFACT_ROOT=../../../Smart-Courseware-Agent_backend/backend/app/agent/data_assets/demo_show
# SOFFICE_PATH=
```

Install dependencies from the monorepo root, then run the development server:

```bash
corepack enable
corepack pnpm install
corepack pnpm --filter=@assistant-ui/teaching-studio dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Backend Handoff

For backend ownership and request/response shapes, see:

- `apps/teaching-studio/API_CONTRACT.md`
- `apps/teaching-studio/lib/studio-contract.ts`

## Docker

Build from the monorepo root:

```bash
docker build -f apps/teaching-studio/Dockerfile -t teaching-studio .
```

Run:

```bash
docker run --rm -p 3000:3000 \
  -e TEACHING_BACKEND_BASE_URL=http://host.docker.internal:8000 \
  -e TEACHING_BACKEND_USER_ID=teacher-001 \
  teaching-studio
```

Or use Compose from the monorepo root:

```bash
TEACHING_BACKEND_BASE_URL=http://host.docker.internal:8000 docker compose up --build
```

The Docker image contains only the frontend server. It still requires:

- a reachable teaching backend at `TEACHING_BACKEND_BASE_URL`
- optional local artifact access via `TEACHING_BACKEND_ARTIFACT_ROOT`
- LibreOffice, or `SOFFICE_PATH`, if you want server-side PPT/DOCX preview to PDF

## Current Known Issues

- The frontend state machine for PPT / lesson-plan completion is still being refined, and the UI may occasionally lag behind the real backend file status.
- Because of the state-sync issue above, preview switching is not fully stable yet even though the real preview/export pipeline exists.
- The feedback-driven regeneration chain still needs further work; repeated edits may cause unstable state transitions or task duplication.
- Several historical integration issues have been fixed, but the full chain from streamed chat reply to final preview handoff is still under active polishing.
