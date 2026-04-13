import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { backendArtifactRoot } from "../_lib/backend-paths";

const backendBaseUrl =
  process.env.TEACHING_BACKEND_BASE_URL ?? "http://127.0.0.1:8000";
const backendChatEndpoint = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/chat`;
const backendChatStreamEndpoint = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/chat/stream`;
const streamChunkDelayMs = Math.max(
  0,
  Number(process.env.TEACHING_CHAT_STREAM_CHUNK_DELAY_MS ?? "45"),
);
const defaultBackendUserId =
  process.env.TEACHING_BACKEND_USER_ID ?? "teacher-001";
const demoModeEnabled = process.env.TEACHING_DEMO_MODE === "true";
const demoChatMode = (
  process.env.TEACHING_DEMO_CHAT_MODE ?? "auto"
).toLowerCase();
const demoTemplateRoot = path.join(backendArtifactRoot, ".demo_templates");
const demoUpdateKeywords =
  /(修改|调整|优化|改一下|改版|重做|补充|更新|细化|重新生成|第二版|新版|第\d+页|这一页|上一版|再改|继续改|修改意见|换上|换成)/;

type DemoVariant = "v1" | "v2";

type BackendChatResponse = {
  session_id: string;
  user_id: string;
  answer: string;
  follow_up_question?: string | null;
  intent_plan?: unknown;
  citations?: unknown[];
  suggested_tools?: string[];
};

type BackendAttachment = {
  type: "image" | "video" | "audio" | "file";
  url?: string;
  base64_data?: string;
  mime_type?: string;
  filename?: string;
};

const demoAssistantReplies: Record<DemoVariant, string> = {
  v1: [
    "已按你当前提供的素材整理出《浮力》首版方案，接下来会生成与首版 PPT 一致的课件和教案。",
    "",
    "首版 PPT 共 9 页，内容会围绕以下模块展开：",
    "- 智能优化课件",
    "- 学习目标与路径",
    "- 什么是浮力？",
    "- 阿基米德的故事",
    "- 物体的沉与浮",
    "- 有趣的浮力实验",
    "- 原理探究与互动活动",
    "- 浮力在生活中的应用",
    "- 总结与迁移",
    "",
    "教案会同步围绕“课程导入 - 目标明确 - 概念认识 - 故事理解 - 实验探究 - 生活应用 - 总结迁移”展开，重点放在浮力概念、沉浮判断、实验活动和生活应用。",
  ].join("\n"),
  v2: [
    "已根据你的修改意见切换到第二版方案，新的输出会和你当前的第二版 PPT 保持一致，旧预览会保留到新版本完成后再替换。",
    "",
    "第二版 PPT 共 10 页，内容会围绕以下模块展开：",
    "- 智能优化课件",
    "- 总结与迁移",
    "- 学习目标与路径",
    "- 什么是浮力？",
    "- 阿基米德的故事",
    "- 物体的沉与浮",
    "- 有趣的浮力实验",
    "- 原理探究与互动活动",
    "- 互动挑战：我是小判官",
    "- 浮力在生活中的应用",
    "",
    "教案会同步围绕“课程导入 - 目标明确 - 概念认识 - 故事理解 - 沉浮判断 - 实验探究 - 互动挑战 - 生活迁移”展开，重点放在浮力概念、沉浮判断、实验活动、课堂互动和生活应用。",
  ].join("\n"),
};

const demoSlideTitles: Record<DemoVariant, string[]> = {
  v1: [
    "智能优化课件",
    "学习目标与路径",
    "什么是浮力？",
    "阿基米德的故事",
    "物体的沉与浮",
    "有趣的浮力实验",
    "原理探究与互动活动",
    "浮力在生活中的应用",
    "总结与迁移",
  ],
  v2: [
    "智能优化课件",
    "总结与迁移",
    "学习目标与路径",
    "什么是浮力？",
    "阿基米德的故事",
    "物体的沉与浮",
    "有趣的浮力实验",
    "原理探究与互动活动",
    "互动挑战：我是小判官",
    "浮力在生活中的应用",
  ],
};

const hasFile = async (targetPath: string) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
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

const getMessageParts = (
  message: UIMessage,
): Array<Record<string, unknown>> => {
  const parts = (message as { parts?: Array<Record<string, unknown>> }).parts;
  return Array.isArray(parts) ? parts : [];
};

const getLatestUserMessageRecord = (messages: UIMessage[]) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return message;
    }
  }

  return undefined;
};

const parseDataUrl = (input: string) => {
  const match = input.match(/^data:([^;,]+)?;base64,([\s\S]+)$/);
  if (!match) return null;

  return {
    mimeType: match[1] || "application/octet-stream",
    base64Data: match[2],
  };
};

const inferAttachmentType = (
  mimeType: string,
  fileName: string,
): BackendAttachment["type"] => {
  const lowered = fileName.toLowerCase();

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (
    mimeType === "application/pdf" ||
    lowered.endsWith(".doc") ||
    lowered.endsWith(".docx") ||
    lowered.endsWith(".ppt") ||
    lowered.endsWith(".pptx") ||
    lowered.endsWith(".txt") ||
    lowered.endsWith(".md")
  ) {
    return "file";
  }

  return "file";
};

const buildBackendAttachments = (message: UIMessage): BackendAttachment[] => {
  const attachments: BackendAttachment[] = [];

  for (const part of getMessageParts(message)) {
    if (part?.type !== "file" || typeof part?.url !== "string") continue;

    const url = part.url.trim();
    if (!url) continue;

    const fileName =
      typeof part.filename === "string" && part.filename.trim()
        ? part.filename.trim()
        : "attachment";
    const mimeType =
      typeof part.mediaType === "string" && part.mediaType.trim()
        ? part.mediaType.trim()
        : "";
    const attachmentType = inferAttachmentType(mimeType, fileName);
    const parsedDataUrl = parseDataUrl(url);

    if (attachmentType === "image" || attachmentType === "video") {
      attachments.push({
        type: attachmentType,
        url,
        mime_type:
          parsedDataUrl?.mimeType || mimeType || "application/octet-stream",
        filename: fileName,
      });
      continue;
    }

    if (parsedDataUrl) {
      attachments.push({
        type: attachmentType,
        base64_data: parsedDataUrl.base64Data,
        mime_type: parsedDataUrl.mimeType,
        filename: fileName,
      });
      continue;
    }

    attachments.push({
      type: attachmentType,
      url,
      mime_type: mimeType || "application/octet-stream",
      filename: fileName,
    });
  }

  return attachments;
};

const resolveDemoVariant = (
  messages: UIMessage[],
  latestUserMessage: string,
): DemoVariant => {
  const conversationText = messages
    .map((message) => getMessageText(message))
    .join("\n");
  return demoUpdateKeywords.test(latestUserMessage) ||
    demoUpdateKeywords.test(conversationText)
    ? "v2"
    : "v1";
};

const readDemoAssistantReply = async (variant: DemoVariant) => {
  const replyPath = path.join(
    demoTemplateRoot,
    variant === "v1" ? "buoyancy_v1" : "buoyancy_v2",
    "assistant_reply.md",
  );

  if (await hasFile(replyPath)) {
    try {
      const content = (await readFile(replyPath, "utf-8")).trim();
      if (content) return content;
    } catch {
      return demoAssistantReplies[variant];
    }
  }

  return demoAssistantReplies[variant];
};

const createTextStreamResponse = ({
  answer,
  sessionId,
  userId,
  messageMetadata,
}: {
  answer: string;
  sessionId: string;
  userId: string;
  messageMetadata?: Record<string, unknown>;
}) => {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const textId = `text-${crypto.randomUUID()}`;

      writer.write({
        type: "start",
        messageMetadata: {
          sessionId,
          userId,
          ...(messageMetadata ?? {}),
        },
      });
      writer.write({ type: "text-start", id: textId });
      try {
        for (const visibleChunk of splitVisibleTextChunks(answer)) {
          writer.write({ type: "text-delta", id: textId, delta: visibleChunk });
          await sleep(streamChunkDelayMs);
        }
      } finally {
        writer.write({ type: "text-end", id: textId });
      }
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({ stream });
};

const sleep = (ms: number) =>
  ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();

const splitVisibleTextChunks = (text: string) => {
  const units = Array.from(text);
  if (units.length <= 1) return units;

  const chunks: string[] = [];
  for (let index = 0; index < units.length; index += 3) {
    chunks.push(units.slice(index, index + 3).join(""));
  }
  return chunks;
};

const createBackendTextStreamResponse = ({
  latestUserMessage,
  sessionId,
  userId,
  structuredContext,
  attachments,
  messageMetadata,
}: {
  latestUserMessage: string;
  sessionId?: string;
  userId: string;
  structuredContext: Record<string, unknown>;
  attachments: BackendAttachment[];
  messageMetadata?: Record<string, unknown>;
}) => {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      let backendResponse: Response | null = null;
      let resolvedSessionId = sessionId || `session-${crypto.randomUUID()}`;
      let resolvedUserId = userId;
      const textId = `text-${crypto.randomUUID()}`;
      let emitted = false;

      try {
        backendResponse = await fetch(backendChatStreamEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            user_id: userId,
            message: latestUserMessage,
            attachments,
            structured_context: structuredContext,
            debug: true,
          }),
        });

        if (backendResponse.ok) {
          resolvedSessionId =
            backendResponse.headers.get("X-Session-Id")?.trim() ||
            resolvedSessionId;
          resolvedUserId =
            backendResponse.headers.get("X-User-Id")?.trim() || resolvedUserId;
        }
      } catch {
        backendResponse = null;
      }

      writer.write({
        type: "start",
        messageMetadata: {
          sessionId: resolvedSessionId,
          userId: resolvedUserId,
          ...(messageMetadata ?? {}),
        },
      });
      writer.write({ type: "text-start", id: textId });

      try {
        const body =
          backendResponse?.ok && backendResponse.body
            ? backendResponse.body
            : null;

        if (!body) {
          const payload = await fetchBackendChatResponse({
            latestUserMessage,
            sessionId,
            userId,
            structuredContext,
            attachments,
          });
          const answer = buildFinalAnswer(payload);

          for (const visibleChunk of splitVisibleTextChunks(answer)) {
            emitted = true;
            writer.write({
              type: "text-delta",
              id: textId,
              delta: visibleChunk,
            });
            await sleep(streamChunkDelayMs);
          }
        } else {
          try {
            const reader = body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            const flushEvent = async (eventBlock: string) => {
              const data = eventBlock
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart())
                .join("\n");

              if (!data) return;
              for (const visibleChunk of splitVisibleTextChunks(data)) {
                emitted = true;
                writer.write({
                  type: "text-delta",
                  id: textId,
                  delta: visibleChunk,
                });
                await sleep(streamChunkDelayMs);
              }
            };

            while (true) {
              const { done, value } = await reader.read();
              buffer += decoder.decode(value ?? new Uint8Array(), {
                stream: !done,
              });

              let boundaryIndex = buffer.indexOf("\n\n");
              while (boundaryIndex !== -1) {
                const eventBlock = buffer.slice(0, boundaryIndex);
                buffer = buffer.slice(boundaryIndex + 2);
                await flushEvent(eventBlock);
                boundaryIndex = buffer.indexOf("\n\n");
              }

              if (done) break;
            }

            const trailing = buffer.trim();
            if (trailing) {
              await flushEvent(trailing);
            }
          } catch {
            if (!emitted) {
              const payload = await fetchBackendChatResponse({
                latestUserMessage,
                sessionId,
                userId,
                structuredContext,
                attachments,
              });
              const answer = buildFinalAnswer(payload);

              for (const visibleChunk of splitVisibleTextChunks(answer)) {
                emitted = true;
                writer.write({
                  type: "text-delta",
                  id: textId,
                  delta: visibleChunk,
                });
                await sleep(streamChunkDelayMs);
              }
            }
          }
        }

        if (!emitted) {
          const payload = await fetchBackendChatResponse({
            latestUserMessage,
            sessionId,
            userId,
            structuredContext,
            attachments,
          });
          const answer = buildFinalAnswer(payload);

          for (const visibleChunk of splitVisibleTextChunks(answer)) {
            writer.write({
              type: "text-delta",
              id: textId,
              delta: visibleChunk,
            });
            await sleep(streamChunkDelayMs);
          }
        }
      } finally {
        writer.write({ type: "text-end", id: textId });
      }

      writer.write({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({ stream });
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

const buildFrontendStructuredContext = (body: Record<string, unknown>) => ({
  frontend_system: typeof body.system === "string" ? body.system : "",
  frontend_config:
    body.config && typeof body.config === "object" ? body.config : {},
  frontend_call_settings:
    body.callSettings && typeof body.callSettings === "object"
      ? body.callSettings
      : {},
});

const buildDemoStructuredContext = ({
  body,
  variant,
}: {
  body: Record<string, unknown>;
  variant: DemoVariant;
}) => ({
  ...buildFrontendStructuredContext(body),
  demo_mode: true,
  demo_variant: variant,
  demo_slide_titles: demoSlideTitles[variant],
  demo_response_requirements: [
    "当前前端处于演示模式，但聊天回复应尽量表现为真实 AI 回复。",
    "回复内容需要贴合当前PPT版本，不要否认或暴露模板机制。",
    "如果用户提出修改意见，请围绕当前版本内容给出自然的中文回复。",
    "当前版本页标题仅供参考，请优先围绕这些页面组织内容。",
  ],
});

const fetchBackendChatResponse = async ({
  latestUserMessage,
  sessionId,
  userId,
  structuredContext,
  attachments,
}: {
  latestUserMessage: string;
  sessionId?: string;
  userId: string;
  structuredContext: Record<string, unknown>;
  attachments: BackendAttachment[];
}) => {
  const backendResponse = await fetch(backendChatEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      user_id: userId,
      message: latestUserMessage,
      attachments,
      structured_context: structuredContext,
      debug: true,
    }),
  });

  if (!backendResponse.ok) {
    const detail = await backendResponse.text();
    throw new Error(detail || "Backend chat endpoint failed.");
  }

  return (await backendResponse.json()) as BackendChatResponse;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const messages = (body.messages ?? []) as UIMessage[];

  const latestUserRecord = getLatestUserMessageRecord(messages);
  const latestUserMessage = latestUserRecord
    ? getMessageText(latestUserRecord)
    : "";
  const latestUserAttachments = latestUserRecord
    ? buildBackendAttachments(latestUserRecord)
    : [];
  const resolvedLatestUserMessage =
    latestUserMessage || latestUserAttachments.length > 0
      ? latestUserMessage || "请理解并分析这些内容"
      : "";

  if (!resolvedLatestUserMessage) {
    return Response.json(
      { error: "missing_user_message", detail: "No user message found." },
      { status: 400 },
    );
  }

  const sessionId = resolveSessionId(body);
  const userId = resolveUserId(body);

  if (demoModeEnabled) {
    const variant = resolveDemoVariant(messages, latestUserMessage);
    const bodyOverride =
      typeof body.demoAssistantReply === "string"
        ? body.demoAssistantReply.trim()
        : "";
    if (bodyOverride) {
      return createTextStreamResponse({
        answer: bodyOverride,
        sessionId: sessionId ?? `demo-${crypto.randomUUID()}`,
        userId,
        messageMetadata: {
          demoMode: true,
          demoVariant: variant,
          demoChatSource: "override",
        },
      });
    }

    if (demoChatMode !== "template") {
      return createBackendTextStreamResponse({
        latestUserMessage: resolvedLatestUserMessage,
        sessionId,
        userId,
        attachments: latestUserAttachments,
        structuredContext: buildDemoStructuredContext({
          body,
          variant,
        }),
        messageMetadata: {
          demoMode: true,
          demoVariant: variant,
          demoChatSource: "backend",
        },
      });
    }

    const answer = await readDemoAssistantReply(variant);

    return createTextStreamResponse({
      answer,
      sessionId: sessionId ?? `demo-${crypto.randomUUID()}`,
      userId,
      messageMetadata: {
        demoMode: true,
        demoVariant: variant,
        demoChatSource: "template",
      },
    });
  }

  const structuredContext = buildFrontendStructuredContext(body);

  return createBackendTextStreamResponse({
    latestUserMessage: resolvedLatestUserMessage,
    sessionId,
    userId,
    attachments: latestUserAttachments,
    structuredContext,
  });
}
