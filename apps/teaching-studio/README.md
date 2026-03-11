This app is being used as a frontend shell for a teaching-content studio.

Backend implementation can be owned separately. The integration contract lives
in `API_CONTRACT.md`.

## Getting Started

If you want to run the current demo backend behavior locally, add your OpenAI
API key to `.env.local`:

```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
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
docker run --rm -p 3000:3000 -e OPENAI_API_KEY=your_key teaching-studio
```

Or use Compose from the monorepo root:

```bash
OPENAI_API_KEY=your_key docker compose up --build
```
