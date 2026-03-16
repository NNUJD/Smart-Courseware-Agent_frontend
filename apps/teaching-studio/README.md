This app is being used as a frontend shell for a teaching-content studio.

Backend implementation can be owned separately. The integration contract lives
in `API_CONTRACT.md`.

## Getting Started

Set your backend address in `.env.local`:

```
TEACHING_BACKEND_BASE_URL=http://127.0.0.1:8000
TEACHING_BACKEND_USER_ID=teacher-001
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
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
