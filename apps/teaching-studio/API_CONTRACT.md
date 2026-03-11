# Teaching Studio API Contract

This app can be treated as a frontend shell. The backend team only needs to
implement the APIs below and keep the payloads stable.

## Source Of Truth

- UI-facing types: `apps/teaching-studio/lib/studio-contract.ts`
- Chat transport: `@assistant-ui/react-ai-sdk` via `AssistantChatTransport`

If the backend changes any field names or enum values, update
`studio-contract.ts` first and treat that file as the canonical contract.

## Endpoints

### 1. `POST /api/chat`

Used by the chat panel. The current frontend runtime is wired in
`apps/teaching-studio/app/assistant.tsx`.

Expected behavior:

- Accept chat history in AI SDK / assistant-ui compatible message format
- Support streaming responses
- Return assistant output in UI message stream format
- Optionally support frontend tool definitions passed from the client

Current request shape used by the app:

```ts
{
  messages: UIMessage[];
  system?: string;
  tools?: Record<string, {
    description?: string;
    parameters: JSONSchema7;
  }>;
}
```

Response expectations:

- HTTP 200
- Streamed response
- Compatible with `result.toUIMessageStreamResponse(...)`

Notes:

- If the backend team wants a custom protocol instead, the frontend runtime
  needs to switch away from `AssistantChatTransport`.
- If they keep this protocol, the current chat UI can remain unchanged.

### 2. `POST /api/studio/materials/upload`

Used by the material binding panel for reference file upload.

Request:

- `Content-Type: multipart/form-data`
- Form field: `file`

Current response contract:

```ts
type MaterialUploadResponse = {
  material: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    parseSummary: string;
    createdAt: string;
    status: "ready" | "uploading" | "error";
    suggestedRole: "knowledge" | "format" | "style" | "case" | "media";
  };
};
```

Field semantics:

- `id`: backend material ID
- `parseSummary`: parsed summary shown directly in UI
- `suggestedRole`: backend's best guess for material usage
- `status`: upload or parse status for the material

Frontend-owned fields not returned by this API:

- `role`
- `linkedKnowledgePoints`
- `note`

Those are edited in the UI after upload.

### 3. `POST /api/studio/artifacts`

Used by the preview workbench. This is the main structured-generation API.

Request:

```ts
type StudioArtifactRequest = {
  latestPrompt: string;
  conversation: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
  intentDraft: {
    teachingGoal: string;
    audience: string;
    duration: string;
    knowledgePoints: string[];
    logicSequence: string[];
    keyDifficulties: string[];
    outputStyle: string;
    finalRequirement: string;
    missingFields: string[];
    confirmed: boolean;
  };
  materials: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    role: "knowledge" | "format" | "style" | "case" | "media";
    linkedKnowledgePoints: string[];
    note: string;
    parseSummary: string;
  }>;
  activeTab: "lesson-plan" | "ppt" | "video" | "word";
};
```

Response:

```ts
type StudioArtifactResponse = {
  intentDraft: IntentDraft;
  artifacts: Record<
    "lesson-plan" | "ppt" | "video" | "word",
    {
      tab: "lesson-plan" | "ppt" | "video" | "word";
      title: string;
      description: string;
      updatedAt?: string;
      downloadName: string;
      status: "idle" | "generating" | "ready" | "error";
      sections: Array<{
        id: string;
        title: string;
        summary: string;
        body: string;
        duration?: string;
      }>;
      slides: Array<{
        id: string;
        title: string;
        caption: string;
        html: string;
      }>;
      storyboard: Array<{
        id: string;
        title: string;
        summary: string;
        visualDirection: string;
      }>;
      previewHtml?: string;
    }
  >;
  summary: string;
};
```

Rendering rules used by the frontend:

- `lesson-plan` and `word` mainly render `sections`
- `ppt` mainly renders `slides[].html` in an `iframe`
- `video` mainly renders `storyboard`
- `summary` is shown in the preview header
- `intentDraft` is shown in the intent summary card and becomes the latest
  frontend state

Backend guidance:

- Always return all four tabs, even if only one was regenerated
- Use stable IDs per section/slide/scene when possible
- Return `status: "ready"` when content is displayable
- If generation fails, return HTTP `>= 400` so the frontend can enter error
  state

### 4. `POST /api/studio/export`

Used by the export button.

Current frontend request body:

```ts
{
  intentDraft: IntentDraft;
  materials: StudioMaterial[];
  artifacts: StudioArtifacts;
}
```

Recommended backend behavior:

- Accept the current workspace snapshot
- Return a downloadable file stream or binary blob
- Set `Content-Disposition` with the real file name
- Set `Content-Type` to match the export format

Supported formats can be decided by the backend team, for example:

- `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `application/zip`
- `text/html`

The frontend does not currently send a `format` field, so if multiple export
formats are needed, add:

```ts
{
  format: "pptx" | "docx" | "zip" | "html";
}
```

and update the export button accordingly.

## Enums

### `ArtifactTab`

```ts
"lesson-plan" | "ppt" | "video" | "word"
```

### `MaterialRole`

```ts
"knowledge" | "format" | "style" | "case" | "media"
```

### `ArtifactPreviewStatus`

```ts
"idle" | "generating" | "ready" | "error"
```

### `MaterialUploadStatus`

```ts
"ready" | "uploading" | "error"
```

## Integration Notes

- The frontend already handles local workspace state; the backend does not need
  to store UI-only selections like the currently selected preview node.
- Optional chat persistence can be added through
  `NEXT_PUBLIC_ASSISTANT_BASE_URL`, but it is not required for the shell.
- If the backend team prefers OpenAPI, generate it from these shapes instead of
  redefining them manually.

## Handoff Checklist

- Confirm whether chat stays on AI SDK stream format or moves to a custom
  protocol
- Confirm whether uploaded files are synchronous or asynchronous to parse
- Confirm whether export is single-format or multi-format
- Confirm whether artifact generation is full-refresh or partial-refresh
