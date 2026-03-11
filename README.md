# Smart-Courseware-Agent_frontend

Frontend workspace for the smart courseware agent.

This repository is based on the `assistant-ui` monorepo structure and currently
uses `apps/teaching-studio` as the main application shell.

## Main App

- Frontend app: `apps/teaching-studio`
- API contract: `apps/teaching-studio/API_CONTRACT.md`
- UI contract types: `apps/teaching-studio/lib/studio-contract.ts`

## Local Development

Requirements:

- Node.js 24+
- pnpm 10+

Install dependencies:

```bash
pnpm install
```

Run the app:

```bash
pnpm --filter=@assistant-ui/teaching-studio dev
```

## Docker

Build:

```bash
docker build -f apps/teaching-studio/Dockerfile -t teaching-studio .
```

Run:

```bash
docker run --rm -p 3000:3000 -e OPENAI_API_KEY=your_key teaching-studio
```

Or with Compose:

```bash
OPENAI_API_KEY=your_key docker compose up --build
```
