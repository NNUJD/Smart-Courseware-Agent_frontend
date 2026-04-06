import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import type {
  ArtifactTab,
  IntentDraft,
  PreviewSection,
  PreviewSlide,
  StudioArtifactRequest,
  StudioArtifactResponse,
  StudioArtifacts,
  VideoStoryboardScene,
} from "@/lib/studio-contract";
import {
  generateBackendArtifactResponse,
  resolveExistingBackendArtifactResponse,
  shouldGenerateCourseware,
} from "../_lib/courseware";
import { backendArtifactRoot } from "../../_lib/backend-paths";

export const maxDuration = 1800;

const emptyIntentDraft: IntentDraft = {
  teachingGoal: "",
  audience: "",
  duration: "",
  knowledgePoints: [],
  logicSequence: [],
  keyDifficulties: [],
  outputStyle: "",
  finalRequirement: "",
  missingFields: [],
  confirmed: false,
};

type GenerationTask = {
  projectId: string;
  status: "pending" | "ready" | "error";
  response?: StudioArtifactResponse;
  error?: string;
  startedAt: number;
  updatedAt: number;
  ownsLock?: boolean;
};

const generationTasks = new Map<string, GenerationTask>();
const generationTasksByProjectId = new Map<string, GenerationTask>();
const generationTasksByFingerprint = new Map<string, GenerationTask>();
const generationLockRoot = path.join(backendArtifactRoot, ".generation-locks");
const triggerAfterAssistant =
  (process.env.TEACHING_TRIGGER_AFTER_ASSISTANT ??
    process.env.NEXT_PUBLIC_TEACHING_TRIGGER_AFTER_ASSISTANT ??
    "false") === "true";
const presetArtifactModeEnabled =
  process.env.TEACHING_PRESET_ARTIFACTS === "true" ||
  process.env.TEACHING_DEMO_MODE === "true";

const fallbackKnowledgePoints = ["教学主题", "核心知识", "课堂应用"];

const genericKnowledgePointPatterns = [
  /^概念导入$/,
  /^核心知识讲解$/,
  /^案例练习$/,
  /^Prompt/i,
  /^user_message$/i,
  /^recent_his/i,
  /^要区分观点和证据的不同$/,
];

const splitKeywords = (input: string) =>
  input
    .split(/[，,。；;\n]/)
    .map((value) => value.trim())
    .filter(Boolean);

const extractQuotedTopic = (input: string) => {
  const match = input.match(/《([^》]{1,20})》/);
  return match?.[1]?.trim() ?? "";
};

const normalizeKnowledgePoints = (items: string[]) =>
  Array.from(
    new Set(
      items
        .map((item) => item.trim())
        .filter(Boolean)
        .filter(
          (item) =>
            !genericKnowledgePointPatterns.some((pattern) =>
              pattern.test(item),
            ),
        )
        .filter((item) => item.length >= 2)
        .filter((item) => !/^[a-zA-Z0-9_\-\s|:：。、，]+$/.test(item)),
    ),
  );

const extractBetween = (input: string, keywords: string[]) => {
  for (const keyword of keywords) {
    const index = input.indexOf(keyword);
    if (index === -1) continue;

    const sliced = input.slice(index + keyword.length);
    const nextSentence = sliced.split(/[。！!\n]/)[0]?.trim();
    if (nextSentence) return nextSentence.replace(/^[:：]/, "").trim();
  }

  return "";
};

const inferDuration = (input: string) => {
  const match = input.match(/(\d+)\s*(分钟|课时|min|mins|minutes)/i);
  if (!match) return "";
  return `${match[1]}${match[2]}`;
};

const inferAudience = (input: string) => {
  const candidates = [
    "小学",
    "初中",
    "高中",
    "大学",
    "一年级",
    "二年级",
    "三年级",
    "四年级",
    "五年级",
    "六年级",
  ];

  return candidates.find((candidate) => input.includes(candidate)) ?? "";
};

const inferStyle = (input: string) => {
  const styles = ["公开课", "活泼", "严谨", "简洁", "探究式", "项目式", "教研"];
  const hit = styles.find((style) => input.includes(style));
  return hit ? `${hit}风格` : "";
};

const mergeUnique = (...lists: string[][]) => {
  return Array.from(
    new Set(
      lists
        .flat()
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
};

const getTurnText = (turn: { text?: string; content?: string }) =>
  (typeof turn.text === "string" && turn.text) ||
  (typeof turn.content === "string" && turn.content) ||
  "";

const getLatestAssistantDraft = (
  conversation: StudioArtifactRequest["conversation"],
) => {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const turn = conversation[index];
    if (turn.role !== "assistant") continue;
    const text = getTurnText(turn).trim();
    if (!text) continue;
    if (/^(当前可用上下文还不够|我继续前需要一个关键信息)/.test(text)) continue;
    return text;
  }
  return "";
};

const hasCompletedAssistantReplyAfterLatestUser = (
  conversation: StudioArtifactRequest["conversation"],
) => {
  let latestUserIndex = -1;

  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    if (conversation[index]?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }

  if (latestUserIndex === -1) return false;

  for (
    let index = conversation.length - 1;
    index > latestUserIndex;
    index -= 1
  ) {
    const turn = conversation[index];
    if (turn?.role !== "assistant") continue;

    const text = getTurnText(turn).trim();
    if (!text) continue;
    if (/^(当前可用上下文还不够|我继续前需要一个关键信息)/.test(text)) {
      return false;
    }

    return true;
  }

  return false;
};

const getLatestUserConversationText = (
  conversation: StudioArtifactRequest["conversation"],
) =>
  conversation
    .filter((turn) => turn.role === "user")
    .slice(-8)
    .map((turn) => getTurnText(turn).trim())
    .filter(Boolean)
    .join("\n");

const toSummary = (input: string, fallback: string) => {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.slice(0, 64);
};

const parseMarkdownSections = (draft: string): PreviewSection[] => {
  const headingMatches = [...draft.matchAll(/^#{1,6}\s+(.+)$/gm)];
  if (headingMatches.length < 2) return [];

  return headingMatches
    .slice(0, 10)
    .map((match, index) => {
      const title = match[1].trim();
      const sectionStart = match.index ?? 0;
      const contentStart = sectionStart + match[0].length;
      const nextMatch = headingMatches[index + 1];
      const contentEnd = nextMatch?.index ?? draft.length;
      const body = draft.slice(contentStart, contentEnd).trim();
      return {
        id: `lesson-ai-${index + 1}`,
        title: title || `模块 ${index + 1}`,
        summary: toSummary(
          body,
          `围绕“${title || `模块 ${index + 1}`}”展开课堂内容。`,
        ),
        body,
      };
    })
    .filter((section) => section.body.length > 0);
};

const buildAssistantBackedLessonSections = (
  draft: string,
  intent: IntentDraft,
): PreviewSection[] => {
  const markdownSections = parseMarkdownSections(draft);
  if (markdownSections.length > 0) return markdownSections;

  const body = draft.trim();
  if (!body) return [];

  return [
    {
      id: "lesson-ai-full",
      title: "教案初稿",
      summary: toSummary(
        body,
        `围绕“${intent.knowledgePoints[0] ?? "核心知识点"}”生成的完整教案草案。`,
      ),
      duration: intent.duration || undefined,
      body,
    },
  ];
};

const buildIntentDraft = (request: StudioArtifactRequest): IntentDraft => {
  const latestPrompt = request.latestPrompt;
  const conversationText = getLatestUserConversationText(request.conversation);
  const existing = request.intentDraft ?? emptyIntentDraft;
  const materialKnowledge = request.materials.flatMap(
    (material) => material.linkedKnowledgePoints,
  );
  const intentSourceText = `${latestPrompt}\n${conversationText}`;
  const quotedTopic = extractQuotedTopic(intentSourceText);

  const teachingGoal =
    existing.teachingGoal ||
    extractBetween(intentSourceText, ["教学目标", "目标是", "希望达成"]) ||
    "围绕核心知识点完成一节可直接落地的课堂设计";
  const audience = existing.audience || inferAudience(intentSourceText);
  const duration = existing.duration || inferDuration(intentSourceText);
  const outputStyle = existing.outputStyle || inferStyle(intentSourceText);

  const detectedKnowledge = normalizeKnowledgePoints(
    mergeUnique(
      quotedTopic ? [quotedTopic] : [],
      existing.knowledgePoints,
      materialKnowledge,
      splitKeywords(
        extractBetween(intentSourceText, [
          "知识点",
          "重点内容",
          "围绕",
          "讲解",
        ]),
      ),
    ),
  );

  const knowledgePoints =
    detectedKnowledge.length > 0
      ? detectedKnowledge
      : normalizeKnowledgePoints([
          quotedTopic || "",
          ...fallbackKnowledgePoints,
        ]).slice(0, 3);

  const logicSequence = mergeUnique(
    existing.logicSequence,
    ["情境导入", "知识建构", "课堂练习", "总结迁移"].slice(
      0,
      Math.max(3, knowledgePoints.length),
    ),
  );

  const keyDifficulties = mergeUnique(
    existing.keyDifficulties,
    knowledgePoints.slice(0, 2).map((item) => `${item}的易错点`),
  );

  const missingFields = [
    !teachingGoal ? "教学目标" : "",
    !audience ? "对象学段" : "",
    knowledgePoints.length === 0 ? "核心知识点" : "",
    !duration ? "课时或时长" : "",
    !outputStyle ? "产出风格" : "",
  ].filter(Boolean);

  const confirmed = missingFields.length <= 1;

  return {
    teachingGoal,
    audience,
    duration,
    knowledgePoints,
    logicSequence,
    keyDifficulties,
    outputStyle,
    finalRequirement: `面向${audience || "目标班级"}，围绕${knowledgePoints.join("、")}开展教学，优先产出${outputStyle || "清晰可讲授"}的教案、PPT、视频脚本和 Word 讲义预览。`,
    missingFields,
    confirmed,
  };
};

const buildLessonPlanSections = (intent: IntentDraft): PreviewSection[] => {
  return intent.logicSequence.map((step, index) => ({
    id: `lesson-${index + 1}`,
    title: step,
    summary: `围绕“${intent.knowledgePoints[index] ?? intent.knowledgePoints[0]}”组织课堂活动与师生互动。`,
    duration: intent.duration
      ? `${Math.max(8, 10 + index * 3)}分钟`
      : undefined,
    body: [
      `目标聚焦：${intent.teachingGoal}`,
      `核心知识：${intent.knowledgePoints[index] ?? intent.knowledgePoints[0]}`,
      `教师动作：使用提问、示例和板书逐步推进${step}。`,
      "学生活动：根据当前环节完成口头表达、练习或案例讨论。",
      `提醒：注意突出${intent.keyDifficulties[index] ?? intent.keyDifficulties[0] ?? "重点难点"}。`,
    ].join("\n\n"),
  }));
};

const renderSlideHtml = (
  title: string,
  caption: string,
  points: string[],
  footer: string,
) => {
  const items = points.map((point) => `<li>${point}</li>`).join("");

  return `
<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:linear-gradient(135deg,#0f172a,#164e63 52%,#f59e0b);color:#f8fafc;">
    <main style="display:flex;flex-direction:column;justify-content:space-between;height:100vh;padding:48px 56px;box-sizing:border-box;">
      <section>
        <div style="display:inline-flex;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,0.14);font-size:14px;letter-spacing:0.06em;">Teaching Studio Preview</div>
        <h1 style="margin:24px 0 12px;font-size:42px;line-height:1.2;">${title}</h1>
        <p style="max-width:760px;margin:0;font-size:20px;line-height:1.7;color:rgba(248,250,252,0.86);">${caption}</p>
      </section>
      <section style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:end;">
        <div style="padding:28px;border-radius:28px;background:rgba(255,255,255,0.12);backdrop-filter:blur(10px);">
          <div style="font-size:14px;text-transform:uppercase;letter-spacing:0.12em;color:rgba(255,255,255,0.7);">课堂重点</div>
          <ul style="margin:16px 0 0;padding-left:24px;font-size:22px;line-height:1.8;">${items}</ul>
        </div>
        <div style="padding:28px;border-radius:28px;background:#f8fafc;color:#0f172a;">
          <div style="font-size:14px;text-transform:uppercase;letter-spacing:0.12em;color:#0f172a99;">授课提示</div>
          <p style="margin:16px 0 0;font-size:20px;line-height:1.7;">${footer}</p>
        </div>
      </section>
    </main>
  </body>
</html>
`.trim();
};

const buildSlides = (intent: IntentDraft): PreviewSlide[] => {
  return intent.knowledgePoints.map((knowledgePoint, index) => ({
    id: `slide-${index + 1}`,
    title: `${index + 1}. ${knowledgePoint}`,
    caption: `面向${intent.audience || "目标学段"}，以${intent.outputStyle || "清晰"}的方式讲解该知识点，并引导学生完成课堂互动。`,
    html: renderSlideHtml(
      `${index + 1}. ${knowledgePoint}`,
      `围绕${knowledgePoint}组织课堂内容，突出${intent.keyDifficulties[index] ?? intent.keyDifficulties[0] ?? "关键概念"}。`,
      [
        `${knowledgePoint}的核心定义`,
        `${knowledgePoint}的典型例题`,
        `${knowledgePoint}的迁移练习`,
      ],
      `本页建议配合板书或案例演示，控制在${Math.max(5, 6 + index)}分钟内讲完。`,
    ),
  }));
};

const buildWordSections = (intent: IntentDraft): PreviewSection[] => {
  return intent.knowledgePoints.map((knowledgePoint, index) => ({
    id: `word-${index + 1}`,
    title: `${knowledgePoint}讲义`,
    summary: `按打印讲义结构整理${knowledgePoint}的定义、步骤和课堂练习提示。`,
    body: [
      `一、知识说明：${knowledgePoint}`,
      `二、适用对象：${intent.audience || "目标学段学生"}`,
      `三、课堂提醒：${intent.keyDifficulties[index] ?? intent.keyDifficulties[0] ?? "强调易错点"}`,
      "四、练习建议：补充一道基础练习与一道迁移练习。",
      "五、教师备注：可在课后打印发放，或作为导学单附在课件后。",
    ].join("\n\n"),
  }));
};

const buildStoryboard = (intent: IntentDraft): VideoStoryboardScene[] => {
  return intent.logicSequence.map((step, index) => ({
    id: `scene-${index + 1}`,
    title: `${step}镜头`,
    summary: `围绕${intent.knowledgePoints[index] ?? intent.knowledgePoints[0]}设计视频画面、字幕与解说节奏。`,
    visualDirection: `建议使用${intent.outputStyle || "清晰"}风格：前景展示教学主题，字幕突出${intent.knowledgePoints[index] ?? intent.knowledgePoints[0]}，镜头节奏控制在${6 + index * 2}秒左右。`,
  }));
};

const createArtifacts = (
  intent: IntentDraft,
  assistantDraft: string,
): StudioArtifacts => {
  const assistantSections = buildAssistantBackedLessonSections(
    assistantDraft,
    intent,
  );
  const lessonPlanSections =
    assistantSections.length > 0
      ? assistantSections
      : buildLessonPlanSections(intent);
  const slides = buildSlides(intent);
  const storyboard = buildStoryboard(intent);
  const wordSections = buildWordSections(intent);
  const updatedAt = new Date().toISOString();

  return {
    "lesson-plan": {
      tab: "lesson-plan",
      title: "教案草案",
      description: "基于当前对话自动生成的课堂流程预览。",
      updatedAt,
      downloadName: "lesson-plan-v1.json",
      status: "ready",
      sections: lessonPlanSections,
      slides: [],
      storyboard: [],
    },
    ppt: {
      tab: "ppt",
      title: "PPT 预览",
      description: "可根据反馈继续改页、调序、增案例。",
      updatedAt,
      downloadName: "slides-v1.json",
      status: "ready",
      sections: [],
      slides,
      storyboard: [],
    },
    video: {
      tab: "video",
      title: "视频脚本",
      description: "当前为视频创意链路与分镜占位预览。",
      updatedAt,
      downloadName: "video-storyboard-v1.json",
      status: "ready",
      sections: [],
      slides: [],
      storyboard,
    },
    word: {
      tab: "word",
      title: "Word 讲义",
      description: "支持转成教师可打印讲义或课堂导学单。",
      updatedAt,
      downloadName: "word-handout-v1.json",
      status: "ready",
      sections: wordSections,
      slides: [],
      storyboard: [],
    },
  };
};

const tabLabels: Record<ArtifactTab, string> = {
  "lesson-plan": "教案",
  ppt: "PPT",
  video: "视频",
  word: "Word",
};

const createIdleArtifacts = (): StudioArtifacts => ({
  "lesson-plan": {
    tab: "lesson-plan",
    title: "教案草案",
    description: "等待智能体完成当前轮回复后再生成教案。",
    downloadName: "lesson-plan-draft.json",
    status: "idle",
    sections: [],
    slides: [],
    storyboard: [],
  },
  ppt: {
    tab: "ppt",
    title: "PPT 预览",
    description: "等待智能体完成当前轮回复后再生成 PPT。",
    downloadName: "slides-draft.json",
    status: "idle",
    sections: [],
    slides: [],
    storyboard: [],
  },
  video: {
    tab: "video",
    title: "视频脚本",
    description: "等待智能体完成当前轮回复后再生成视频脚本。",
    downloadName: "video-storyboard-draft.json",
    status: "idle",
    sections: [],
    slides: [],
    storyboard: [],
  },
  word: {
    tab: "word",
    title: "Word 讲义",
    description: "等待智能体完成当前轮回复后再生成讲义。",
    downloadName: "word-handout-draft.json",
    status: "idle",
    sections: [],
    slides: [],
    storyboard: [],
  },
});

const buildSummary = (
  intent: IntentDraft,
  activeTab: ArtifactTab,
  hasAssistantDraft: boolean,
) => {
  const sourceHint = hasAssistantDraft
    ? "已同步最新对话草案。"
    : "当前仍使用结构化模板预览。";
  return `${sourceHint} 当前已整理出${intent.knowledgePoints.length}个知识点，并生成${tabLabels[activeTab]}方向的首版预览。${
    intent.missingFields.length > 0
      ? `仍建议补充：${intent.missingFields.join("、")}。`
      : "当前信息已满足继续细化修改。"
  }`;
};

const _buildRequestDigest = (
  request: StudioArtifactRequest,
  intentDraft: IntentDraft,
  _assistantDraft: string,
) => {
  const hash = createHash("sha1");
  hash.update(
    JSON.stringify({
      projectId: request.projectId,
      latestPrompt: request.latestPrompt,
      materials: request.materials,
      topic: intentDraft.knowledgePoints.slice(0, 2).join("、"),
      audience: intentDraft.audience,
      duration: intentDraft.duration,
      outputStyle: intentDraft.outputStyle,
    }),
  );
  return hash.digest("hex");
};

const buildPendingTaskDigest = ({
  projectId,
  latestPrompt,
  materials,
  intentDraft,
}: {
  projectId: string;
  latestPrompt: string;
  materials: StudioArtifactRequest["materials"];
  intentDraft: IntentDraft;
}) => {
  const hash = createHash("sha1");
  hash.update(
    JSON.stringify({
      projectId,
      latestPrompt,
      materials,
      topic: intentDraft.knowledgePoints.slice(0, 2).join("、"),
      audience: intentDraft.audience,
      duration: intentDraft.duration,
      outputStyle: intentDraft.outputStyle,
    }),
  );
  return hash.digest("hex");
};

const buildPendingTaskFingerprint = ({
  latestPrompt,
  materials,
  intentDraft,
}: {
  latestPrompt: string;
  materials: StudioArtifactRequest["materials"];
  intentDraft: IntentDraft;
}) => {
  const hash = createHash("sha1");
  hash.update(
    JSON.stringify({
      latestPrompt,
      materials,
      topic: intentDraft.knowledgePoints.slice(0, 2).join("、"),
      audience: intentDraft.audience,
      duration: intentDraft.duration,
      outputStyle: intentDraft.outputStyle,
    }),
  );
  return hash.digest("hex");
};

const toGeneratingArtifacts = (
  artifacts: StudioArtifacts,
): StudioArtifacts => ({
  "lesson-plan": {
    ...artifacts["lesson-plan"],
    status: "generating",
  },
  ppt: {
    ...artifacts.ppt,
    status: "generating",
  },
  video: {
    ...artifacts.video,
    status: "generating",
  },
  word: {
    ...artifacts.word,
    status: "generating",
  },
});

const createGeneratingArtifacts = (): StudioArtifacts =>
  toGeneratingArtifacts(createIdleArtifacts());

const buildGeneratingResponse = (
  request: StudioArtifactRequest,
  intentDraft: IntentDraft,
  assistantDraft: string,
): StudioArtifactResponse => ({
  projectId: request.projectId,
  intentDraft,
  artifacts: presetArtifactModeEnabled
    ? toGeneratingArtifacts(createArtifacts(intentDraft, assistantDraft))
    : createGeneratingArtifacts(),
  summary: `${
    presetArtifactModeEnabled
      ? "已启动预设产物模拟生成流程"
      : "已提交真实后端课件生成任务"
  }，正在持续生成 ${
    request.activeTab === "ppt" ? "PPT" : tabLabels[request.activeTab]
  } 与配套文件，请稍候自动同步完成状态。`,
});

const buildWaitingForAssistantResponse = (
  request: StudioArtifactRequest,
  intentDraft: IntentDraft,
): StudioArtifactResponse => ({
  projectId: request.projectId,
  intentDraft,
  artifacts: createIdleArtifacts(),
  summary:
    "当前轮对话仍在等待智能体回复完成。待左侧助手消息完整出现后，再开始生成 PPT、教案和视频预览。",
});

const getGenerationLockPath = (projectId: string) =>
  path.join(generationLockRoot, `${projectId}.lock`);

const tryAcquireGenerationLock = async (projectId: string) => {
  await mkdir(generationLockRoot, { recursive: true });

  try {
    const handle = await open(getGenerationLockPath(projectId), "wx");
    await handle.close();
    return true;
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String(error.code)
        : undefined;
    if (code === "EEXIST") return false;
    throw error;
  }
};

const releaseGenerationLock = async (projectId: string) => {
  try {
    await rm(getGenerationLockPath(projectId));
  } catch {
    return;
  }
};

const hasGenerationLock = async (projectId: string) => {
  try {
    await access(getGenerationLockPath(projectId));
    return true;
  } catch {
    return false;
  }
};

const ensureGenerationTask = async ({
  digest,
  fingerprint,
  request,
  intentDraft,
  assistantDraft,
}: {
  digest: string;
  fingerprint: string;
  request: StudioArtifactRequest;
  intentDraft: IntentDraft;
  assistantDraft: string;
}) => {
  const existingForFingerprint = generationTasksByFingerprint.get(fingerprint);
  if (existingForFingerprint?.status === "pending") {
    const completedResponse = await resolveExistingBackendArtifactResponse({
      request: { ...request, projectId: existingForFingerprint.projectId },
      intentDraft,
      assistantDraft,
    });
    if (completedResponse) {
      existingForFingerprint.status = "ready";
      existingForFingerprint.response = completedResponse;
      existingForFingerprint.updatedAt = Date.now();
      generationTasks.set(digest, existingForFingerprint);
      generationTasksByProjectId.set(
        existingForFingerprint.projectId,
        existingForFingerprint,
      );
      return existingForFingerprint;
    }

    const lockExists = await hasGenerationLock(
      existingForFingerprint.projectId,
    );
    const staleForMs = Date.now() - existingForFingerprint.startedAt;

    if (lockExists || staleForMs < 30 * 60_000) {
      existingForFingerprint.updatedAt = Date.now();
      generationTasks.set(digest, existingForFingerprint);
      generationTasksByProjectId.set(
        existingForFingerprint.projectId,
        existingForFingerprint,
      );
      return existingForFingerprint;
    }

    generationTasksByFingerprint.delete(fingerprint);
    generationTasksByProjectId.delete(existingForFingerprint.projectId);
  }

  const existingForProject = request.projectId
    ? generationTasksByProjectId.get(request.projectId)
    : undefined;
  if (existingForProject?.status === "pending") {
    const completedResponse = await resolveExistingBackendArtifactResponse({
      request: { ...request, projectId: existingForProject.projectId },
      intentDraft,
      assistantDraft,
    });
    if (completedResponse) {
      existingForProject.status = "ready";
      existingForProject.response = completedResponse;
      existingForProject.updatedAt = Date.now();
      generationTasks.set(digest, existingForProject);
      return existingForProject;
    }

    const lockExists = await hasGenerationLock(existingForProject.projectId);
    const staleForMs = Date.now() - existingForProject.startedAt;

    if (lockExists || staleForMs < 30 * 60_000) {
      existingForProject.updatedAt = Date.now();
      generationTasks.set(digest, existingForProject);
      return existingForProject;
    }

    generationTasksByProjectId.delete(existingForProject.projectId);
    generationTasksByFingerprint.delete(fingerprint);
  }

  const existing = generationTasks.get(digest);
  if (existing?.status === "pending") {
    const completedResponse = await resolveExistingBackendArtifactResponse({
      request,
      intentDraft,
      assistantDraft,
    });
    if (completedResponse) {
      existing.status = "ready";
      existing.response = completedResponse;
      existing.updatedAt = Date.now();
      return existing;
    }

    const lockExists = await hasGenerationLock(existing.projectId);
    const staleForMs = Date.now() - existing.startedAt;

    if (lockExists || staleForMs < 30 * 60_000) {
      existing.updatedAt = Date.now();
      return existing;
    }

    generationTasks.delete(digest);
    generationTasksByProjectId.delete(existing.projectId);
    generationTasksByFingerprint.delete(fingerprint);
  }

  if (existing) {
    generationTasks.delete(digest);
    generationTasksByProjectId.delete(existing.projectId);
    generationTasksByFingerprint.delete(fingerprint);
  }

  const task: GenerationTask = {
    projectId: request.projectId ?? "",
    status: "pending",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

  generationTasks.set(digest, task);
  generationTasksByProjectId.set(task.projectId, task);
  generationTasksByFingerprint.set(fingerprint, task);

  const ownsLock = await tryAcquireGenerationLock(task.projectId);
  task.ownsLock = ownsLock;

  if (!ownsLock) {
    return task;
  }

  void generateBackendArtifactResponse({
    request,
    intentDraft,
    assistantDraft,
  })
    .then((response) => {
      task.status = "ready";
      task.response = response;
      task.updatedAt = Date.now();
    })
    .catch((error) => {
      task.status = "error";
      task.error =
        error instanceof Error ? error.message : "backend_generation_failed";
      task.updatedAt = Date.now();
    })
    .finally(() => {
      generationTasksByProjectId.delete(task.projectId);
      generationTasksByFingerprint.delete(fingerprint);
      void releaseGenerationLock(task.projectId);
    });

  return task;
};

export async function POST(request: Request) {
  const rawBody = (await request.json()) as Partial<StudioArtifactRequest> & {
    activeArtifact?: ArtifactTab;
  };
  const incomingProjectId =
    typeof rawBody.projectId === "string" ? rawBody.projectId.trim() : "";
  const bodyBase: StudioArtifactRequest = {
    latestPrompt: rawBody.latestPrompt ?? "",
    projectId: incomingProjectId || "",
    conversation: rawBody.conversation ?? [],
    intentDraft: rawBody.intentDraft ?? emptyIntentDraft,
    materials: rawBody.materials ?? [],
    activeTab: rawBody.activeTab ?? rawBody.activeArtifact ?? "ppt",
  };
  const intentDraft = buildIntentDraft(bodyBase);
  const assistantDraft = getLatestAssistantDraft(bodyBase.conversation);

  const incomingRequest: StudioArtifactRequest = {
    ...bodyBase,
    projectId:
      incomingProjectId ||
      `studio-${randomUUID().replace(/-/g, "").slice(0, 13)}`,
  };

  let body = incomingRequest;

  if (incomingRequest.projectId) {
    const existingFromProject = await resolveExistingBackendArtifactResponse({
      request: incomingRequest,
      intentDraft,
      assistantDraft,
    });

    if (existingFromProject) {
      return Response.json(existingFromProject);
    }
  }

  if (
    incomingRequest.projectId &&
    (await hasGenerationLock(incomingRequest.projectId))
  ) {
    return Response.json(
      buildGeneratingResponse(incomingRequest, intentDraft, assistantDraft),
    );
  }

  if (
    triggerAfterAssistant &&
    !hasCompletedAssistantReplyAfterLatestUser(bodyBase.conversation)
  ) {
    return Response.json(
      buildWaitingForAssistantResponse(incomingRequest, intentDraft),
    );
  }

  if (shouldGenerateCourseware(body, intentDraft, assistantDraft)) {
    const existingFromIncoming = await resolveExistingBackendArtifactResponse({
      request: incomingRequest,
      intentDraft,
      assistantDraft,
    });

    if (existingFromIncoming) {
      return Response.json(existingFromIncoming);
    }

    body = incomingRequest;

    const projectId =
      incomingRequest.projectId ??
      body.projectId ??
      `studio-${randomUUID().replace(/-/g, "").slice(0, 13)}`;
    const digest = buildPendingTaskDigest({
      projectId,
      latestPrompt: body.latestPrompt,
      materials: body.materials,
      intentDraft,
    });
    const fingerprint = buildPendingTaskFingerprint({
      latestPrompt: body.latestPrompt,
      materials: body.materials,
      intentDraft,
    });
    const task = await ensureGenerationTask({
      digest,
      fingerprint,
      request: body,
      intentDraft,
      assistantDraft,
    });

    if (task.status === "ready" && task.response) {
      return Response.json(task.response);
    }

    if (task.status === "error") {
      return Response.json(
        {
          error: "backend_courseware_generation_failed",
          detail: task.error ?? "backend_generation_failed",
        },
        { status: 502 },
      );
    }

    const completedResponse = await resolveExistingBackendArtifactResponse({
      request: body,
      intentDraft,
      assistantDraft,
    });
    if (completedResponse) {
      return Response.json(completedResponse);
    }

    return Response.json(
      buildGeneratingResponse(
        { ...body, projectId: task.projectId },
        intentDraft,
        assistantDraft,
      ),
    );
  }

  const artifacts = createArtifacts(intentDraft, assistantDraft);
  if (!presetArtifactModeEnabled) {
    const response: StudioArtifactResponse = {
      projectId: incomingRequest.projectId,
      intentDraft,
      artifacts: createIdleArtifacts(),
      summary: hasCompletedAssistantReplyAfterLatestUser(bodyBase.conversation)
        ? "已接收到左侧对话生成的大纲内容。正式版将等待真实后端课件生成链路返回文件结果，右侧暂不展示本地结构化伪预览。"
        : "当前轮对话仍在等待智能体回复完成。待左侧助手消息完整出现后，再开始生成 PPT、教案和视频预览。",
    };

    return Response.json(response);
  }

  const response: StudioArtifactResponse = {
    intentDraft,
    artifacts,
    summary: buildSummary(
      intentDraft,
      body.activeTab,
      assistantDraft.length > 0,
    ),
  };

  return Response.json(response);
}
