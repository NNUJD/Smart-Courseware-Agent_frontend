import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";

const backendBaseUrl =
  process.env.TEACHING_BACKEND_BASE_URL ?? "http://127.0.0.1:8000";
const backendChatEndpoint = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/chat`;
const defaultBackendUserId =
  process.env.TEACHING_BACKEND_USER_ID ?? "teacher-001";

type BackendChatResponse = {
  session_id: string;
  user_id: string;
  answer: string;
  follow_up_question?: string | null;
  intent_plan?: unknown;
  citations?: unknown[];
  suggested_tools?: string[];
};

const getMessageText = (message: UIMessage): string => {
  const directContent = (message as { content?: unknown }).content;
  if (typeof directContent === "string") {
    return directContent.trim();
  }

  const parts = (message as { parts?: Array<Record<string, unknown>> }).parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => {
      if (part?.type === "text" && typeof part?.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("")
    .trim();
};

const getLatestUserMessage = (messages: UIMessage[]): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;

    const text = getMessageText(message);
    if (text) return text;
  }

  return "";
};

const resolveUserId = (body: Record<string, unknown>): string => {
  const fromBody = body.user_id ?? body.userId;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();

  const metadata = body.metadata;
  if (metadata && typeof metadata === "object") {
    const raw = (metadata as Record<string, unknown>).userId;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }

  return defaultBackendUserId;
};

const resolveSessionId = (
  body: Record<string, unknown>,
): string | undefined => {
  const fromBody = body.session_id ?? body.sessionId ?? body.id;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();
  return undefined;
};

const buildFinalAnswer = (payload: BackendChatResponse): string => {
  const answer = payload.answer?.trim() ?? "";
  const followUp = payload.follow_up_question?.trim() ?? "";

  if (!answer && followUp) return followUp;
  if (!followUp) return answer;
  if (answer.includes(followUp)) return answer;

  return `${answer}\n\n${followUp}`.trim();
};

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const messages = (body.messages ?? []) as UIMessage[];

  const latestUserMessage = getLatestUserMessage(messages);
  if (!latestUserMessage) {
    return Response.json(
      { error: "missing_user_message", detail: "No user message found." },
      { status: 400 },
    );
  }

  const sessionId = resolveSessionId(body);
  const userId = resolveUserId(body);

  const structuredContext = {
    frontend_system: typeof body.system === "string" ? body.system : "",
    frontend_config:
      body.config && typeof body.config === "object" ? body.config : {},
    frontend_call_settings:
      body.callSettings && typeof body.callSettings === "object"
        ? body.callSettings
        : {},
  };

  const backendResponse = await fetch(backendChatEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      user_id: userId,
      message: latestUserMessage,
      structured_context: structuredContext,
      debug: true,
    }),
  });

  if (!backendResponse.ok) {
    const detail = await backendResponse.text();
    return Response.json(
      {
        error: "backend_chat_failed",
        detail: detail || "Backend chat endpoint failed.",
      },
      { status: backendResponse.status },
    );
  }

  const payload = (await backendResponse.json()) as BackendChatResponse;
  const answer = buildFinalAnswer(payload);

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const textId = `text-${crypto.randomUUID()}`;

      writer.write({
        type: "start",
        messageMetadata: {
          sessionId: payload.session_id,
          userId: payload.user_id,
          intentPlan: payload.intent_plan,
          citations: payload.citations ?? [],
          suggestedTools: payload.suggested_tools ?? [],
        },
      });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: answer });
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
