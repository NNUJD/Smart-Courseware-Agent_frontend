import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
  IntentDraft,
  PreviewSection,
  PreviewSlide,
  StudioArtifactRequest,
  StudioArtifactResponse,
  StudioArtifacts,
  VideoStoryboardScene,
} from "@/lib/studio-contract";
import { backendArtifactRoot } from "../../_lib/backend-paths";

type BackendCoursewareResponse = {
  project_id: string;
  topic: string;
  num_pages: number;
  auto_ai_image_generation_enabled: boolean;
  auto_online_image_search_enabled: boolean;
  draft_pptx_path?: string | null;
  pptx_path?: string | null;
  lesson_plan_path?: string | null;
  optimized_structure_path?: string | null;
  video_path?: string | null;
};

type OptimizedSlideRecord = {
  slide_index?: number;
  title?: string;
  slide_type?: string;
  bullets?: string[];
};

type DemoVariant = "v1" | "v2";

type DemoProjectManifest = {
  variant: DemoVariant;
  topic: string;
  createdAt: string;
};

type DemoScenario = {
  topic: string;
  audience: string;
  duration: string;
  outputStyle: string;
  teachingGoal: string;
  knowledgePoints: string[];
  logicSequence: string[];
  keyDifficulties: string[];
  slideRecords: OptimizedSlideRecord[];
};

const backendBaseUrl =
  process.env.TEACHING_BACKEND_BASE_URL ?? "http://127.0.0.1:8000";
const backendAutoOnlineImageSearch =
  process.env.TEACHING_BACKEND_AUTO_ONLINE_IMAGE_SEARCH !== "false";
const backendAutoAiImageGeneration =
  process.env.TEACHING_BACKEND_AUTO_AI_IMAGE_GENERATION !== "false";
const demoArtifactModeEnabled =
  process.env.TEACHING_PRESET_ARTIFACTS === "true" ||
  process.env.TEACHING_DEMO_MODE === "true";
const triggerAfterAssistant =
  (process.env.TEACHING_TRIGGER_AFTER_ASSISTANT ??
    process.env.NEXT_PUBLIC_TEACHING_TRIGGER_AFTER_ASSISTANT ??
    "false") === "true";
const forcedDemoVariant = (() => {
  const raw = process.env.TEACHING_DEMO_FORCE_VARIANT?.trim().toLowerCase();
  return raw === "v1" || raw === "v2" ? raw : null;
})();
const demoDelayMs = Math.max(
  1200,
  Number(process.env.TEACHING_DEMO_DELAY_MS ?? "12000") || 12000,
);
const backendCoursewareEndpoint = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/courseware/generate`;
const backendCoursewareUploadEndpoint = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/courseware/generate/upload`;
const demoTemplateRoot = path.join(backendArtifactRoot, ".demo_templates");
const demoVariantKeywords =
  /(修改|调整|优化|改一下|改版|重做|补充|更新|细化|重新生成|第二版|新版)/;
const demoScenarios: Record<DemoVariant, DemoScenario> = {
  v1: {
    topic: "浮力",
    audience: "小学五年级",
    duration: "40分钟",
    outputStyle: "实验探究风格",
    teachingGoal:
      "帮助学生理解浮力概念，能结合生活现象判断浮力方向，并通过实验归纳影响浮力大小的因素。",
    knowledgePoints: [
      "浮力概念",
      "浮力方向",
      "影响浮力大小的因素",
      "阿基米德原理",
    ],
    logicSequence: [
      "课程导入",
      "目标明确",
      "概念认识",
      "故事理解",
      "实验探究",
      "生活应用",
      "总结迁移",
    ],
    keyDifficulties: [
      "浮力与重力、支持力的区分",
      "排开液体体积与浮力大小的关系",
    ],
    slideRecords: [
      {
        slide_index: 1,
        title: "智能优化课件",
        slide_type: "cover",
        bullets: [
          "聚焦浮力主题与五年级探究课堂定位",
          "通过课程导入页建立课堂情境与学习期待",
          "引出本课将围绕浮力现象、实验探究和生活应用展开",
        ],
      },
      {
        slide_index: 2,
        title: "学习目标与路径",
        slide_type: "goals",
        bullets: [
          "认识浮力的基本概念",
          "理解浮力的关键机制",
          "通过案例、图示和互动任务建立完整认知",
        ],
      },
      {
        slide_index: 3,
        title: "什么是浮力？",
        slide_type: "concept",
        bullets: [
          "浮力是液体对物体向上的托力",
          "通过压入水中的体验感受无形的向上托力",
          "帮助学生明确浮力方向总是竖直向上",
        ],
      },
      {
        slide_index: 4,
        title: "阿基米德的故事",
        slide_type: "story",
        bullets: [
          "从阿基米德故事引出浮力大小规律",
          "理解排开液体越多，受到的浮力越大",
          "用生活类比帮助学生形成直观认识",
        ],
      },
      {
        slide_index: 5,
        title: "物体的沉与浮",
        slide_type: "analysis",
        bullets: [
          "通过比较浮力与重力判断物体沉浮",
          "区分漂浮物体和下沉物体的典型例子",
          "帮助学生建立沉浮判断的基本模型",
        ],
      },
      {
        slide_index: 6,
        title: "有趣的浮力实验",
        slide_type: "experiment",
        bullets: [
          "以鸡蛋在盐水中的变化作为实验情境",
          "明确实验材料、现象观察和操作步骤",
          "为解释液体密度与浮力关系做铺垫",
        ],
      },
      {
        slide_index: 7,
        title: "原理探究与互动活动",
        slide_type: "interactive",
        bullets: [
          "解释鸡蛋在清水和盐水中的不同状态",
          "理解液体密度越大，浮力越大",
          "通过互动任务让学生完成证据表达",
        ],
      },
      {
        slide_index: 8,
        title: "浮力在生活中的应用",
        slide_type: "application",
        bullets: [
          "联系轮船、潜水艇和热气球等生活情境",
          "说明浮力让交通与生活更便利",
          "引导学生把课堂知识迁移到真实世界",
        ],
      },
      {
        slide_index: 9,
        title: "总结与迁移",
        slide_type: "summary",
        bullets: [
          "回顾浮力定义、沉浮判断和关键结论",
          "提出用今天知识解释真实现象的迁移任务",
          "完成课堂复盘与课后延伸思考",
        ],
      },
    ],
  },
  v2: {
    topic: "浮力",
    audience: "小学五年级",
    duration: "40分钟",
    outputStyle: "实验探究风格",
    teachingGoal:
      "在首版基础上强化实验逻辑与课堂互动，让学生能更完整地用证据解释浮力现象并完成应用迁移。",
    knowledgePoints: [
      "浮力概念",
      "浮力方向",
      "阿基米德原理",
      "浮沉条件",
      "生活应用",
    ],
    logicSequence: [
      "课程导入",
      "目标明确",
      "概念认识",
      "故事理解",
      "沉浮判断",
      "实验探究",
      "互动挑战",
      "生活迁移",
    ],
    keyDifficulties: [
      "从实验数据过渡到阿基米德原理",
      "把浮力知识迁移到真实生活情境",
    ],
    slideRecords: [
      {
        slide_index: 1,
        title: "智能优化课件",
        slide_type: "cover",
        bullets: [
          "聚焦浮力主题与五年级探究课堂定位",
          "通过课程导入页建立课堂情境与学习期待",
          "引出本课将围绕浮力现象、实验探究和生活应用展开",
        ],
      },
      {
        slide_index: 2,
        title: "总结与迁移",
        slide_type: "summary",
        bullets: [
          "回顾浮力是液体对物体向上的托力",
          "梳理沉浮取决于浮力与重力比较的结论",
          "引导学生用课堂知识解释真实生活现象",
        ],
      },
      {
        slide_index: 3,
        title: "学习目标与路径",
        slide_type: "goals",
        bullets: [
          "认识浮力的基本概念",
          "理解浮力的关键机制",
          "通过案例、图示和互动任务建立完整认知",
        ],
      },
      {
        slide_index: 4,
        title: "什么是浮力？",
        slide_type: "concept",
        bullets: [
          "用无形的大手比喻帮助学生理解浮力",
          "通过把泡沫块压入水中的体验感受阻力",
          "帮助学生明确浮力方向总是竖直向上",
        ],
      },
      {
        slide_index: 5,
        title: "阿基米德的故事",
        slide_type: "story",
        bullets: [
          "从阿基米德故事引出浮力大小规律",
          "理解排开液体越多，受到的浮力越大",
          "用浴缸溢水类比帮助学生形成直观认识",
        ],
      },
      {
        slide_index: 6,
        title: "物体的沉与浮",
        slide_type: "analysis",
        bullets: [
          "通过比较浮力与重力判断物体沉浮",
          "区分漂浮物体和下沉物体的典型例子",
          "帮助学生建立沉浮判断的基本模型",
        ],
      },
      {
        slide_index: 7,
        title: "有趣的浮力实验",
        slide_type: "experiment",
        bullets: [
          "以鸡蛋在盐水中的变化作为实验情境",
          "明确实验材料、现象观察和操作步骤",
          "为解释液体密度与浮力关系做铺垫",
        ],
      },
      {
        slide_index: 8,
        title: "原理探究与互动活动",
        slide_type: "interactive",
        bullets: [
          "解释鸡蛋在清水和盐水中的不同状态",
          "理解液体密度越大，浮力越大",
          "通过互动活动强化证据和结论之间的联系",
        ],
      },
      {
        slide_index: 9,
        title: "互动挑战：我是小判官",
        slide_type: "practice",
        bullets: [
          "判断木块、石头和实心塑料球在水中的状态",
          "引导学生先给出判断再说明理由",
          "用课堂概念检验学生理解程度",
        ],
      },
      {
        slide_index: 10,
        title: "浮力在生活中的应用",
        slide_type: "application",
        bullets: [
          "结合轮船、潜水艇、游泳圈和视力表浮球等情境",
          "强调浮力无处不在并服务于生活",
          "引导学生完成从课堂到真实场景的迁移",
        ],
      },
    ],
  },
};

const generationCache = new Map<string, Promise<StudioArtifactResponse>>();

const clipText = (input: string, fallback: string, limit = 72) => {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.slice(0, limit);
};

const escapeHtml = (input: string) =>
  input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderPreviewSlideHtml = (
  title: string,
  caption: string,
  bullets: string[],
  footer: string,
) => {
  const bulletItems = bullets
    .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
    .join("");

  return `
<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:linear-gradient(140deg,#0f172a,#1d4ed8 45%,#38bdf8);font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#e2e8f0;">
    <main style="display:flex;flex-direction:column;justify-content:space-between;height:100vh;padding:44px 52px;box-sizing:border-box;">
      <section>
        <div style="display:inline-flex;border-radius:999px;background:rgba(255,255,255,0.14);padding:8px 14px;font-size:14px;letter-spacing:0.08em;">Smart Courseware Agent</div>
        <h1 style="margin:24px 0 14px;font-size:40px;line-height:1.2;">${escapeHtml(title)}</h1>
        <p style="margin:0;max-width:760px;font-size:19px;line-height:1.7;color:rgba(226,232,240,0.88);">${escapeHtml(caption)}</p>
      </section>
      <section style="display:grid;grid-template-columns:1.2fr .8fr;gap:24px;align-items:end;">
        <div style="padding:28px;border-radius:28px;background:rgba(15,23,42,0.32);backdrop-filter:blur(10px);">
          <div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(226,232,240,0.7);">本页要点</div>
          <ul style="margin:16px 0 0;padding-left:24px;font-size:22px;line-height:1.8;">${bulletItems}</ul>
        </div>
        <div style="padding:28px;border-radius:28px;background:#f8fafc;color:#0f172a;">
          <div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#475569;">授课提示</div>
          <p style="margin:16px 0 0;font-size:20px;line-height:1.7;">${escapeHtml(footer)}</p>
        </div>
      </section>
    </main>
  </body>
</html>
`.trim();
};

const toBulletBody = (bullets: string[], fallback: string) => {
  if (bullets.length === 0) return fallback;
  return bullets.map((bullet, index) => `${index + 1}. ${bullet}`).join("\n\n");
};

const extractQuotedTopic = (input: string) => {
  const match = input.match(/《([^》]{1,20})》/);
  return match?.[1]?.trim() ?? "";
};

const getMessageText = (message: { text?: string; content?: string }) =>
  (typeof message.text === "string" && message.text) ||
  (typeof message.content === "string" && message.content) ||
  "";

const normalizeTopicCandidate = (input: string) => {
  const stripped = input
    .replace(/\s+/g, " ")
    .replace(
      /^(请|帮我|麻烦你|请你)?(直接)?(生成|制作|设计|输出|整理|创建)(一份|一个|一节)?/g,
      "",
    )
    .replace(
      /^(小学|初中|高中)?([一二三四五六七八九十\d]+年级)(上册|下册)?(科学|语文|数学|英语)?/g,
      "",
    )
    .replace(/^(科学|语文|数学|英语)/g, "")
    .replace(/(的)?(教案|PPT|课件|微课|教学设计|课堂设计|教学方案).*/g, "")
    .replace(/^(关于|围绕)/g, "")
    .replace(/[，,。；;：:“”"（）()]/g, " ")
    .trim();

  const firstChunk = stripped.split(/\s+/).find(Boolean) ?? "";
  return firstChunk.trim();
};

const extractPromptTopic = (input: string) => {
  const quoted = extractQuotedTopic(input);
  if (quoted) return quoted;

  const match = input.match(
    /(?:小学|初中|高中)?(?:[一二三四五六七八九十\d]+年级)?(?:科学|语文|数学|英语)?([^，。；;：:\s]{1,16}?)(?:的)?(?:教案|PPT|课件|微课|教学设计)/,
  );

  return normalizeTopicCandidate(match?.[1] ?? "");
};

const isFeedbackPlaceholderTopic = (input: string) =>
  /^(这版|这一版|这份|这个|当前|刚才|上个版本|上一版|原来那版|该版)$/.test(
    input.trim(),
  );

const pickCleanKnowledgeTopic = (knowledgePoints: string[]) => {
  const cleaned = knowledgePoints
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => value.length <= 12)
    .filter((value) => !/[，,。；;：:]/.test(value))
    .filter(
      (value) => !/^(概念导入|核心知识讲解|课堂互动|总结迁移)$/.test(value),
    );

  return normalizeTopicCandidate(cleaned[0] ?? "");
};

const inferTopic = (
  request: StudioArtifactRequest,
  intentDraft: IntentDraft,
  assistantDraft: string,
) => {
  const userMessages = request.conversation
    .filter((message) => message.role === "user")
    .map((message) => getMessageText(message))
    .filter(Boolean);
  const quotedTopic =
    extractPromptTopic(request.latestPrompt) ||
    extractPromptTopic(userMessages.join("\n"));
  const previousPromptTopic =
    userMessages
      .slice(0, -1)
      .reverse()
      .map((message) => extractPromptTopic(message))
      .find(
        (candidate) => candidate && !isFeedbackPlaceholderTopic(candidate),
      ) ?? "";
  const cleanKnowledgeTopic = pickCleanKnowledgeTopic(
    intentDraft.knowledgePoints,
  );
  const candidate =
    (quotedTopic && !isFeedbackPlaceholderTopic(quotedTopic)
      ? quotedTopic
      : "") ||
    previousPromptTopic ||
    cleanKnowledgeTopic ||
    normalizeTopicCandidate(intentDraft.knowledgePoints.slice(0, 1).join("")) ||
    extractPromptTopic(intentDraft.teachingGoal) ||
    request.latestPrompt ||
    assistantDraft;

  const normalized = normalizeTopicCandidate(candidate) || candidate.trim();
  return normalized.slice(0, 16) || "教学主题";
};

const inferNumPages = (intentDraft: IntentDraft) => {
  return Math.min(12, Math.max(8, intentDraft.knowledgePoints.length + 2));
};

const buildGenerationKey = (
  request: StudioArtifactRequest,
  intentDraft: IntentDraft,
  assistantDraft: string,
) => {
  const hash = createHash("sha1");
  const topic = inferTopic(request, intentDraft, assistantDraft);
  const numPages = inferNumPages(intentDraft);
  hash.update(
    JSON.stringify({
      latestPrompt: request.latestPrompt,
      materials: request.materials,
      topic,
      numPages,
      audience: intentDraft.audience,
      duration: intentDraft.duration,
      outputStyle: intentDraft.outputStyle,
    }),
  );
  return hash.digest("hex");
};

const buildGenerationCacheKey = (
  request: StudioArtifactRequest,
  intentDraft: IntentDraft,
  assistantDraft: string,
) => {
  const hash = createHash("sha1");
  hash.update(
    JSON.stringify({
      projectId: request.projectId,
      latestPrompt: request.latestPrompt,
      materials: request.materials,
      topic: inferTopic(request, intentDraft, assistantDraft),
      audience: intentDraft.audience,
      duration: intentDraft.duration,
      outputStyle: intentDraft.outputStyle,
      knowledgePoints: intentDraft.knowledgePoints,
    }),
  );
  return hash.digest("hex");
};

const buildMultimodalMaterialMessage = (
  request: StudioArtifactRequest,
  assistantDraft: string,
) => {
  const baseInstruction =
    assistantDraft.trim() ||
    request.latestPrompt.trim() ||
    "请结合上传素材生成课件。";
  const materialNotes = request.materials
    .map((material, index) => {
      const detailParts = [
        material.role ? `用途：${material.role}` : "",
        material.linkedKnowledgePoints.length > 0
          ? `关联知识点：${material.linkedKnowledgePoints.join("、")}`
          : "",
        material.note ? `补充说明：${material.note}` : "",
      ].filter(Boolean);

      return detailParts.length > 0
        ? `${index + 1}. ${material.name}；${detailParts.join("；")}`
        : "";
    })
    .filter(Boolean);

  if (materialNotes.length === 0) {
    return baseInstruction;
  }

  return `${baseInstruction}\n\n请同时结合以下素材说明生成课件：\n${materialNotes.join("\n")}`;
};

const resolveUsableMultimodalMaterials = async (
  materials: StudioArtifactRequest["materials"],
) => {
  const resolved = await Promise.all(
    materials.map(async (material) => {
      if (!material.storedPath) return null;

      try {
        const fileBuffer = await readFile(material.storedPath);
        return {
          name: material.name,
          mimeType: material.mimeType || "application/octet-stream",
          buffer: fileBuffer,
        };
      } catch {
        return null;
      }
    }),
  );

  return resolved.filter((material) => material !== null);
};

export const buildStableProjectId = (
  request: StudioArtifactRequest,
  intentDraft: IntentDraft,
  assistantDraft: string,
) => {
  const generationKey = buildGenerationKey(
    request,
    intentDraft,
    assistantDraft,
  );
  return {
    generationKey,
    projectId: `studio-${generationKey.slice(0, 13)}`,
  };
};

const mergeUniqueStrings = (...lists: (readonly string[] | undefined)[]) =>
  Array.from(
    new Set(
      lists.flatMap((list) =>
        (list ?? []).map((value) => value.trim()).filter(Boolean),
      ),
    ),
  );

const resolveDemoVariant = (request: StudioArtifactRequest): DemoVariant => {
  if (forcedDemoVariant) return forcedDemoVariant;
  return demoVariantKeywords.test(request.latestPrompt) ? "v2" : "v1";
};

const buildDemoIntentDraft = (
  intentDraft: IntentDraft,
  scenario: DemoScenario,
): IntentDraft => {
  const mergedKnowledgePoints =
    intentDraft.knowledgePoints.length > 0
      ? mergeUniqueStrings(
          intentDraft.knowledgePoints,
          scenario.knowledgePoints,
        )
      : scenario.knowledgePoints;
  const mergedLogicSequence =
    intentDraft.logicSequence.length > 0
      ? mergeUniqueStrings(intentDraft.logicSequence, scenario.logicSequence)
      : scenario.logicSequence;
  const mergedKeyDifficulties =
    intentDraft.keyDifficulties.length > 0
      ? mergeUniqueStrings(
          intentDraft.keyDifficulties,
          scenario.keyDifficulties,
        )
      : scenario.keyDifficulties;

  return {
    teachingGoal: intentDraft.teachingGoal || scenario.teachingGoal,
    audience: intentDraft.audience || scenario.audience,
    duration: intentDraft.duration || scenario.duration,
    knowledgePoints: mergedKnowledgePoints,
    logicSequence: mergedLogicSequence,
    keyDifficulties: mergedKeyDifficulties,
    outputStyle: intentDraft.outputStyle || scenario.outputStyle,
    finalRequirement:
      intentDraft.finalRequirement ||
      `围绕${scenario.topic}产出可直接用于课堂展示的PPT、教案、视频和讲义。`,
    missingFields: [],
    confirmed: true,
  };
};

const getDemoTemplateDir = (variant: DemoVariant) =>
  path.join(demoTemplateRoot, variant === "v1" ? "buoyancy_v1" : "buoyancy_v2");

const getDemoProjectPaths = (projectId: string) => {
  const projectDir = path.join(backendArtifactRoot, projectId);
  return {
    projectDir,
    pptxPath: path.join(projectDir, "generated_courseware_optimized.pptx"),
    pptPreviewPdfPath: path.join(
      projectDir,
      "generated_courseware_preview.pdf",
    ),
    lessonPlanPath: path.join(projectDir, "lesson_plan_optimized.docx"),
    lessonPlanPreviewPdfPath: path.join(projectDir, "lesson_plan_preview.pdf"),
    videoPath: path.join(projectDir, "teaching_demo_video.mp4"),
    optimizedStructurePath: path.join(projectDir, "optimized_structure.json"),
    manifestPath: path.join(projectDir, "demo_manifest.json"),
  };
};

const readDemoProjectManifest = async (
  projectId: string,
): Promise<DemoProjectManifest | null> => {
  const { manifestPath } = getDemoProjectPaths(projectId);

  try {
    const raw = await readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DemoProjectManifest>;
    if (
      (parsed.variant === "v1" || parsed.variant === "v2") &&
      typeof parsed.topic === "string"
    ) {
      return {
        variant: parsed.variant,
        topic: parsed.topic,
        createdAt:
          typeof parsed.createdAt === "string"
            ? parsed.createdAt
            : new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
};

const materializeDemoProject = async ({
  projectId,
  variant,
}: {
  projectId: string;
  variant: DemoVariant;
}) => {
  const scenario = demoScenarios[variant];
  const templateDir = getDemoTemplateDir(variant);
  const {
    projectDir,
    pptxPath,
    pptPreviewPdfPath,
    lessonPlanPath,
    lessonPlanPreviewPdfPath,
    videoPath,
    optimizedStructurePath,
    manifestPath,
  } = getDemoProjectPaths(projectId);
  const copyIfExists = async (fromPath: string, toPath: string) => {
    try {
      await access(fromPath);
      await copyFile(fromPath, toPath);
    } catch {
      return;
    }
  };

  await mkdir(projectDir, { recursive: true });
  await Promise.all([
    copyFile(
      path.join(templateDir, "generated_courseware_optimized.pptx"),
      pptxPath,
    ),
    copyIfExists(
      path.join(templateDir, "generated_courseware_preview.pdf"),
      pptPreviewPdfPath,
    ),
    copyFile(
      path.join(templateDir, "lesson_plan_optimized.docx"),
      lessonPlanPath,
    ),
    copyIfExists(
      path.join(templateDir, "lesson_plan_preview.pdf"),
      lessonPlanPreviewPdfPath,
    ),
    copyFile(path.join(templateDir, "teaching_demo_video.mp4"), videoPath),
    writeFile(
      optimizedStructurePath,
      JSON.stringify(scenario.slideRecords, null, 2),
      "utf-8",
    ),
    writeFile(
      manifestPath,
      JSON.stringify(
        {
          variant,
          topic: scenario.topic,
          createdAt: new Date().toISOString(),
        } satisfies DemoProjectManifest,
        null,
        2,
      ),
      "utf-8",
    ),
  ]);
};

const buildMediaPreviewUrl = (localPath: string) =>
  `/api/studio/media?path=${encodeURIComponent(localPath)}`;

const buildPdfPreviewUrl = (localPath: string) =>
  `/api/studio/preview-file?path=${encodeURIComponent(localPath)}`;

const hasFile = async (targetPath: string) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const renderPdfPreviewHtml = ({
  title,
  fileName,
  pdfPath,
}: {
  title: string;
  fileName: string;
  pdfPath: string;
}) =>
  `
<!doctype html>
<html lang="zh-CN">
  <head>
    <style>
      html, body {
        margin: 0;
        height: 100%;
        background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
        font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      }
      main {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 16px;
        box-sizing: border-box;
      }
      .titlebar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.8);
        color: #334155;
        font-size: 13px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #38bdf8;
      }
      iframe {
        flex: 1;
        width: 100%;
        border: 0;
        border-radius: 22px;
        background: white;
        box-shadow: 0 16px 50px rgba(15, 23, 42, 0.14);
      }
    </style>
  </head>
  <body>
    <main>
      <div class="titlebar">
        <span class="dot"></span>
        <span>${escapeHtml(title)}</span>
        <span style="opacity:0.72;">${escapeHtml(fileName)}</span>
      </div>
      <iframe src="${escapeHtml(buildPdfPreviewUrl(pdfPath))}" title="${escapeHtml(title)}"></iframe>
    </main>
  </body>
</html>
`.trim();

const renderDemoDocumentPreviewHtml = ({
  label,
  title,
  fileName,
  items,
}: {
  label: string;
  title: string;
  fileName: string;
  items: Array<{ title: string; body: string }>;
}) => {
  const itemMarkup = items
    .map((item) =>
      `
        <article style="border-radius:24px;border:1px solid rgba(148,163,184,0.22);background:rgba(255,255,255,0.86);padding:20px 22px;box-shadow:0 20px 40px rgba(15,23,42,0.08);">
          <h3 style="margin:0 0 10px;font-size:20px;line-height:1.4;color:#0f172a;">${escapeHtml(item.title)}</h3>
          <p style="margin:0;font-size:14px;line-height:1.9;color:#334155;white-space:pre-wrap;">${escapeHtml(item.body)}</p>
        </article>
      `.trim(),
    )
    .join("");

  return `
<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:linear-gradient(180deg,#f7fbff 0%,#eef4ff 100%);font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a;">
    <main style="padding:32px 36px 40px;box-sizing:border-box;">
      <section style="margin-bottom:24px;border-radius:28px;background:linear-gradient(135deg,#0f172a,#1d4ed8);padding:28px 30px;color:#f8fafc;box-shadow:0 24px 60px rgba(15,23,42,0.22);">
        <div style="display:inline-flex;border-radius:999px;background:rgba(255,255,255,0.12);padding:8px 14px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;">${escapeHtml(label)}</div>
        <h1 style="margin:18px 0 8px;font-size:34px;line-height:1.25;">${escapeHtml(title)}</h1>
        <p style="margin:0;font-size:14px;line-height:1.8;color:rgba(248,250,252,0.84);">演示文件：${escapeHtml(fileName)}</p>
      </section>
      <section style="display:grid;gap:16px;">${itemMarkup}</section>
    </main>
  </body>
</html>
`.trim();
};

const renderDemoPptPreviewHtml = ({
  topic,
  fileName,
  slides,
}: {
  topic: string;
  fileName: string;
  slides: OptimizedSlideRecord[];
}) => {
  const cards = slides
    .map((slide, index) => {
      const bullets = (slide.bullets ?? []).slice(0, 3);
      const bulletMarkup = bullets
        .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
        .join("");

      return `
        <article style="border-radius:24px;background:rgba(255,255,255,0.92);padding:18px 18px 20px;border:1px solid rgba(148,163,184,0.22);box-shadow:0 18px 44px rgba(30,41,59,0.08);">
          <div style="font-size:12px;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;">Slide ${index + 1}</div>
          <h3 style="margin:10px 0 12px;font-size:20px;line-height:1.4;color:#0f172a;">${escapeHtml(slide.title ?? `第 ${index + 1} 页`)}</h3>
          <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.8;color:#334155;">${bulletMarkup}</ul>
        </article>
      `.trim();
    })
    .join("");

  return `
<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:linear-gradient(180deg,#eff6ff 0%,#dbeafe 100%);font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a;">
    <main style="padding:32px 36px 40px;">
      <section style="margin-bottom:24px;border-radius:30px;background:linear-gradient(135deg,#0f172a,#1d4ed8 48%,#38bdf8);padding:30px 32px;color:#f8fafc;box-shadow:0 26px 60px rgba(15,23,42,0.24);">
        <div style="display:inline-flex;border-radius:999px;background:rgba(255,255,255,0.14);padding:8px 14px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;">PPT Preview</div>
        <h1 style="margin:18px 0 10px;font-size:36px;line-height:1.2;">${escapeHtml(topic)}课件预览</h1>
        <p style="margin:0;font-size:15px;line-height:1.8;color:rgba(248,250,252,0.86);">当前展示的是本轮生成结果的页面结构概览，可直接下载 ${escapeHtml(fileName)} 查看完整成品。</p>
      </section>
      <section style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;">${cards}</section>
    </main>
  </body>
</html>
`.trim();
};

const renderDemoVideoPreviewHtml = ({
  fileName,
  videoPath,
  scenes,
}: {
  fileName: string;
  videoPath: string;
  scenes: VideoStoryboardScene[];
}) => {
  const sceneMarkup = scenes
    .slice(0, 5)
    .map((scene, index) =>
      `
        <article style="border-radius:22px;border:1px solid rgba(148,163,184,0.2);background:rgba(255,255,255,0.08);padding:16px 18px;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.7);">Scene ${index + 1}</div>
          <h3 style="margin:8px 0 8px;font-size:18px;line-height:1.45;color:#f8fafc;">${escapeHtml(scene.title)}</h3>
          <p style="margin:0;font-size:13px;line-height:1.8;color:rgba(226,232,240,0.86);">${escapeHtml(scene.summary)}</p>
        </article>
      `.trim(),
    )
    .join("");

  return `
<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:linear-gradient(180deg,#0f172a 0%,#1e293b 100%);font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#e2e8f0;">
    <main style="padding:28px 32px 36px;">
      <section style="margin-bottom:22px;">
        <div style="display:inline-flex;border-radius:999px;background:rgba(56,189,248,0.16);padding:8px 14px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#bae6fd;">Video Preview</div>
        <h1 style="margin:16px 0 8px;font-size:32px;line-height:1.25;">视频成片与分镜预览</h1>
        <p style="margin:0;font-size:14px;line-height:1.8;color:rgba(226,232,240,0.82);">${escapeHtml(fileName)}</p>
      </section>
      <section style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,0.9fr);gap:18px;align-items:start;">
        <div style="border-radius:28px;background:rgba(15,23,42,0.42);padding:18px;border:1px solid rgba(148,163,184,0.18);box-shadow:0 20px 50px rgba(15,23,42,0.28);">
          <video controls playsinline style="display:block;width:100%;border-radius:20px;background:#020617;">
            <source src="${escapeHtml(buildMediaPreviewUrl(videoPath))}" type="video/mp4" />
          </video>
        </div>
        <div style="display:grid;gap:14px;">${sceneMarkup}</div>
      </section>
    </main>
  </body>
</html>
`.trim();
};

const buildDemoResponseSummary = (projectId: string, variant: DemoVariant) =>
  variant === "v2"
    ? `已根据最新修改意见完成课件更新，生成项目 ${projectId}。当前预览、PPT、教案和视频都已同步到第二版内容。`
    : `已完成首版课件生成，生成项目 ${projectId}。当前预览、PPT、教案和视频都已同步到首版内容。`;

const buildDemoArtifactResponse = async ({
  request,
  intentDraft,
  variant,
}: {
  request: StudioArtifactRequest;
  intentDraft: IntentDraft;
  variant: DemoVariant;
}): Promise<StudioArtifactResponse> => {
  const scenario = demoScenarios[variant];
  const mergedIntentDraft = buildDemoIntentDraft(intentDraft, scenario);
  const optimizedSlides = scenario.slideRecords;
  const pptSlides = buildPreviewSlides(optimizedSlides, scenario.topic);
  const lessonSections = buildLessonSections(
    optimizedSlides,
    mergedIntentDraft,
  );
  const wordSections = buildWordSections(optimizedSlides, mergedIntentDraft);
  const storyboard = buildStoryboard(optimizedSlides, mergedIntentDraft);
  const projectId =
    request.projectId ||
    buildStableProjectId(request, mergedIntentDraft, "").projectId;
  const {
    pptxPath,
    pptPreviewPdfPath,
    lessonPlanPath,
    lessonPlanPreviewPdfPath,
    videoPath,
  } = getDemoProjectPaths(projectId);
  const updatedAt = new Date().toISOString();
  const pptFileName = path.basename(pptxPath);
  const lessonPlanFileName = path.basename(lessonPlanPath);
  const videoFileName = path.basename(videoPath);
  const [hasPptPreviewPdf, hasLessonPreviewPdf] = await Promise.all([
    hasFile(pptPreviewPdfPath),
    hasFile(lessonPlanPreviewPdfPath),
  ]);

  return {
    projectId,
    intentDraft: mergedIntentDraft,
    artifacts: {
      "lesson-plan": {
        tab: "lesson-plan",
        title: "教案草案",
        description: "当前预览已整理为可直接讲授的教案结构。",
        updatedAt,
        downloadName: lessonPlanFileName,
        status: "ready",
        sections: lessonSections,
        slides: [],
        storyboard: [],
        previewHtml: hasLessonPreviewPdf
          ? renderPdfPreviewHtml({
              title: `${scenario.topic}教案预览`,
              fileName: lessonPlanFileName,
              pdfPath: lessonPlanPreviewPdfPath,
            })
          : renderDemoDocumentPreviewHtml({
              label: "Lesson Plan",
              title: `${scenario.topic}教案预览`,
              fileName: lessonPlanFileName,
              items: lessonSections.map((section) => ({
                title: section.title,
                body: section.body,
              })),
            }),
        download: {
          fileName: lessonPlanFileName,
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          localPath: lessonPlanPath,
        },
      },
      ppt: {
        tab: "ppt",
        title: "PPT 预览",
        description: "当前预览展示本轮生成课件的页面结构与讲授重点。",
        updatedAt,
        downloadName: pptFileName,
        status: "ready",
        sections: [],
        slides: pptSlides,
        storyboard: [],
        previewHtml: hasPptPreviewPdf
          ? renderPdfPreviewHtml({
              title: `${scenario.topic}课件预览`,
              fileName: pptFileName,
              pdfPath: pptPreviewPdfPath,
            })
          : renderDemoPptPreviewHtml({
              topic: scenario.topic,
              fileName: pptFileName,
              slides: optimizedSlides,
            }),
        download: {
          fileName: pptFileName,
          contentType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          localPath: pptxPath,
        },
      },
      video: {
        tab: "video",
        title: "视频脚本",
        description: "当前视频部分已同步成片与分镜说明。",
        updatedAt,
        downloadName: videoFileName,
        status: "ready",
        sections: [],
        slides: [],
        storyboard,
        previewHtml: renderDemoVideoPreviewHtml({
          fileName: videoFileName,
          videoPath,
          scenes: storyboard,
        }),
        download: {
          fileName: videoFileName,
          contentType: "video/mp4",
          localPath: videoPath,
        },
      },
      word: {
        tab: "word",
        title: "Word 讲义",
        description: "当前讲义预览已和教案保持同步，可直接导出。",
        updatedAt,
        downloadName: lessonPlanFileName,
        status: "ready",
        sections: wordSections,
        slides: [],
        storyboard: [],
        previewHtml: hasLessonPreviewPdf
          ? renderPdfPreviewHtml({
              title: `${scenario.topic}讲义预览`,
              fileName: lessonPlanFileName,
              pdfPath: lessonPlanPreviewPdfPath,
            })
          : renderDemoDocumentPreviewHtml({
              label: "Handout",
              title: `${scenario.topic}讲义预览`,
              fileName: lessonPlanFileName,
              items: wordSections.map((section) => ({
                title: section.title,
                body: section.body,
              })),
            }),
        download: {
          fileName: lessonPlanFileName,
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          localPath: lessonPlanPath,
        },
      },
    },
    summary: buildDemoResponseSummary(projectId, variant),
  };
};

const extractIntentSearchTerms = (
  intentDraft: IntentDraft,
  topic: string,
  latestPrompt: string,
) => {
  const rawTerms = [
    topic,
    ...intentDraft.knowledgePoints,
    intentDraft.teachingGoal,
    intentDraft.finalRequirement,
    extractPromptTopic(latestPrompt),
  ];

  const tokens = rawTerms
    .flatMap((value) => value.split(/[，,。；;、\s]/))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => value.length >= 2)
    .filter(
      (value) =>
        !/^(课堂|知识|内容|讲解|导入|互动|总结|风格|清晰)$/.test(value),
    );

  return Array.from(new Set(tokens)).slice(0, 12);
};

const scoreTextByTerms = (text: string, terms: string[]) => {
  if (!text || terms.length === 0) return 0;
  return terms.reduce((score, term) => {
    if (!text.includes(term)) return score;
    return score + Math.max(1, Math.min(term.length, 6));
  }, 0);
};

const resolveExistingBackendPayloadByProjectId = async ({
  projectId,
  topic,
  numPages,
}: {
  projectId: string;
  topic: string;
  numPages: number;
}): Promise<BackendCoursewareResponse | null> => {
  const projectDir = path.join(backendArtifactRoot, projectId);
  const optimizedPpt = path.join(
    projectDir,
    "generated_courseware_optimized.pptx",
  );
  const rawPpt = path.join(projectDir, "generated_by_pptagent_raw.pptx");
  const lessonPlan = path.join(projectDir, "lesson_plan_optimized.docx");
  const optimizedStructure = path.join(projectDir, "optimized_structure.json");

  try {
    await access(optimizedPpt);
  } catch {
    return null;
  }

  const pickIfExists = async (targetPath: string) => {
    try {
      await access(targetPath);
      return targetPath;
    } catch {
      return null;
    }
  };

  return {
    project_id: projectId,
    topic,
    num_pages: numPages,
    auto_ai_image_generation_enabled: false,
    auto_online_image_search_enabled: true,
    draft_pptx_path: await pickIfExists(rawPpt),
    pptx_path: optimizedPpt,
    lesson_plan_path: await pickIfExists(lessonPlan),
    optimized_structure_path: await pickIfExists(optimizedStructure),
  };
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const waitForCompletedBackendPayload = async ({
  projectId,
  topic,
  numPages,
  timeoutMs = 25 * 60 * 1000,
  intervalMs = 4000,
}: {
  projectId: string;
  topic: string;
  numPages: number;
  timeoutMs?: number;
  intervalMs?: number;
}) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const payload = await resolveExistingBackendPayloadByProjectId({
      projectId,
      topic,
      numPages,
    });

    if (payload?.pptx_path) {
      return payload;
    }

    await sleep(intervalMs);
  }

  throw new Error("backend courseware generation timed out before completion");
};

const _resolveExistingBackendPayloadByIntent = async ({
  topic,
  numPages,
  intentDraft,
  latestPrompt,
}: {
  topic: string;
  numPages: number;
  intentDraft: IntentDraft;
  latestPrompt: string;
}): Promise<BackendCoursewareResponse | null> => {
  const searchTerms = extractIntentSearchTerms(
    intentDraft,
    topic,
    latestPrompt,
  );

  try {
    const entries = await readdir(backendArtifactRoot, { withFileTypes: true });
    const directoryMeta = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const projectDir = path.join(backendArtifactRoot, entry.name);
          const optimizedPpt = path.join(
            projectDir,
            "generated_courseware_optimized.pptx",
          );

          try {
            await access(optimizedPpt);
          } catch {
            return null;
          }

          const metadata = await stat(optimizedPpt);
          return {
            projectId: entry.name,
            projectDir,
            mtimeMs: metadata.mtimeMs,
            optimizedStructure: path.join(
              projectDir,
              "optimized_structure.json",
            ),
          };
        }),
    );

    const recentCandidates = directoryMeta
      .filter(
        (candidate): candidate is NonNullable<(typeof directoryMeta)[number]> =>
          candidate !== null,
      )
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, 24);

    if (recentCandidates.length === 0) return null;

    const scoredCandidates = await Promise.all(
      recentCandidates.map(async (candidate) => {
        let structureText = "";
        try {
          structureText = await readFile(candidate.optimizedStructure, "utf-8");
        } catch {
          structureText = "";
        }

        const score =
          scoreTextByTerms(candidate.projectId, searchTerms) +
          scoreTextByTerms(structureText, searchTerms);

        return {
          ...candidate,
          score,
        };
      }),
    );

    const bestCandidate = scoredCandidates.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.mtimeMs - left.mtimeMs;
    })[0];

    if (!bestCandidate || bestCandidate.score <= 0) return null;

    return resolveExistingBackendPayloadByProjectId({
      projectId: bestCandidate.projectId,
      topic,
      numPages,
    });
  } catch {
    return null;
  }
};

const resolveLatestCompletedBackendPayload = async ({
  topic,
  numPages,
}: {
  topic: string;
  numPages: number;
}): Promise<BackendCoursewareResponse | null> => {
  try {
    const entries = await readdir(backendArtifactRoot, { withFileTypes: true });
    const completedDirs = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const projectDir = path.join(backendArtifactRoot, entry.name);
          const optimizedPpt = path.join(
            projectDir,
            "generated_courseware_optimized.pptx",
          );

          try {
            const metadata = await stat(optimizedPpt);
            return {
              projectId: entry.name,
              mtimeMs: metadata.mtimeMs,
            };
          } catch {
            return null;
          }
        }),
    );

    const latest = completedDirs
      .filter(
        (candidate): candidate is NonNullable<(typeof completedDirs)[number]> =>
          candidate !== null,
      )
      .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];

    if (!latest) return null;

    return resolveExistingBackendPayloadByProjectId({
      projectId: latest.projectId,
      topic,
      numPages,
    });
  } catch {
    return null;
  }
};

const resolveExistingBackendPayload = async ({
  request,
  intentDraft,
  assistantDraft,
}: {
  request: StudioArtifactRequest;
  intentDraft: IntentDraft;
  assistantDraft: string;
}): Promise<BackendCoursewareResponse | null> => {
  const topic = inferTopic(request, intentDraft, assistantDraft);
  const numPages = inferNumPages(intentDraft);

  if (request.projectId) {
    const recoveredByProjectId = await resolveExistingBackendPayloadByProjectId(
      {
        projectId: request.projectId,
        topic,
        numPages,
      },
    );
    if (recoveredByProjectId) return recoveredByProjectId;
    return null;
  }
  return null;
};

const resolveExistingDemoArtifactResponse = async ({
  request,
  intentDraft,
}: {
  request: StudioArtifactRequest;
  intentDraft: IntentDraft;
}) => {
  if (!request.projectId) return null;

  const manifest = await readDemoProjectManifest(request.projectId);
  if (!manifest) return null;

  const { pptxPath, lessonPlanPath, videoPath, optimizedStructurePath } =
    getDemoProjectPaths(request.projectId);

  try {
    await Promise.all([
      access(pptxPath),
      access(lessonPlanPath),
      access(videoPath),
      access(optimizedStructurePath),
    ]);
  } catch {
    return null;
  }

  return buildDemoArtifactResponse({
    request,
    intentDraft,
    variant: manifest.variant,
  });
};

const resolveLatestCompletedDemoArtifactResponse = async ({
  request,
  intentDraft,
}: {
  request: StudioArtifactRequest;
  intentDraft: IntentDraft;
}) => {
  try {
    const entries = await readdir(backendArtifactRoot, { withFileTypes: true });
    const completedProjects = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const manifest = await readDemoProjectManifest(entry.name);
          if (!manifest) return null;

          const { pptxPath } = getDemoProjectPaths(entry.name);
          try {
            const metadata = await stat(pptxPath);
            return {
              projectId: entry.name,
              mtimeMs: metadata.mtimeMs,
              manifest,
            };
          } catch {
            return null;
          }
        }),
    );

    const latest = completedProjects
      .filter(
        (
          candidate,
        ): candidate is NonNullable<(typeof completedProjects)[number]> =>
          candidate !== null,
      )
      .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];

    if (!latest) return null;

    return buildDemoArtifactResponse({
      request: {
        ...request,
        projectId: latest.projectId,
      },
      intentDraft,
      variant: latest.manifest.variant,
    });
  } catch {
    return null;
  }
};

const generateDemoArtifactResponseUncached = async ({
  request,
  intentDraft,
}: {
  request: StudioArtifactRequest;
  intentDraft: IntentDraft;
}) => {
  const variant = resolveDemoVariant(request);
  const projectId =
    request.projectId ||
    buildStableProjectId(
      request,
      buildDemoIntentDraft(intentDraft, demoScenarios[variant]),
      "",
    ).projectId;

  await sleep(demoDelayMs);
  await materializeDemoProject({ projectId, variant });

  return buildDemoArtifactResponse({
    request: {
      ...request,
      projectId,
    },
    intentDraft,
    variant,
  });
};

const readOptimizedSlides = async (targetPath: string | null | undefined) => {
  if (!targetPath) return [] as OptimizedSlideRecord[];

  try {
    const content = await readFile(targetPath, "utf-8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as OptimizedSlideRecord[]) : [];
  } catch {
    return [];
  }
};

const buildPreviewSlides = (
  slides: OptimizedSlideRecord[],
  topic: string,
): PreviewSlide[] => {
  if (slides.length === 0) {
    return [
      {
        id: "slide-generated-summary",
        title: `${topic} 课件已生成`,
        caption:
          "当前已走通真实后端课件生成链路，可直接下载 PPT 文件查看完整成品。",
        html: renderPreviewSlideHtml(
          `${topic} 课件已生成`,
          "当前预览基于后端生成结果整理，可继续通过右上角下载按钮获取真实 PPT 文件。",
          [
            "课件生成流程已完成",
            "可下载优化后的 PPT 文件",
            "可同步下载教案 Word 文件",
          ],
          "如果需要进一步改页、补案例或调整风格，可以继续在左侧对话中提出修改意见。",
        ),
      },
    ];
  }

  return slides.map((slide, index) => {
    const bullets = (slide.bullets ?? []).filter(Boolean);
    const title = slide.title?.trim() || `第 ${index + 1} 页`;
    const caption =
      bullets[0] ?? `围绕“${title}”展开讲解，当前预览来自后端生成的真实结构。`;

    return {
      id: `slide-${slide.slide_index ?? index + 1}`,
      title,
      caption,
      html: renderPreviewSlideHtml(
        title,
        caption,
        bullets.length > 0
          ? bullets
          : ["已生成课件结构，可下载 PPT 查看完整排版效果。"],
        `建议围绕“${title}”控制讲授节奏，并结合课堂互动进行展开。`,
      ),
    };
  });
};

const buildLessonSections = (
  slides: OptimizedSlideRecord[],
  intentDraft: IntentDraft,
): PreviewSection[] => {
  if (slides.length === 0) {
    return [
      {
        id: "lesson-generated-summary",
        title: "教案已生成",
        summary: "后端已经生成教案文件，可直接下载查看完整 Word 版本。",
        duration: intentDraft.duration || undefined,
        body: "当前预览未能直接解析 Word 内容，但真实教案文档已经生成完成，可通过下载按钮获取。",
      },
    ];
  }

  return slides.map((slide, index) => {
    const bullets = (slide.bullets ?? []).filter(Boolean);
    const title = slide.title?.trim() || `教学环节 ${index + 1}`;

    return {
      id: `lesson-${slide.slide_index ?? index + 1}`,
      title,
      summary: clipText(bullets[0] ?? "", `围绕“${title}”组织课堂讲授与互动。`),
      duration: intentDraft.duration || undefined,
      body: toBulletBody(
        bullets,
        `围绕“${title}”展开讲授，并结合课堂互动推进学习目标达成。`,
      ),
    };
  });
};

const buildWordSections = (
  slides: OptimizedSlideRecord[],
  intentDraft: IntentDraft,
): PreviewSection[] => {
  return buildLessonSections(slides, intentDraft).map((section, index) => ({
    ...section,
    id: `word-${index + 1}`,
    title: `${section.title}讲义`,
    summary: clipText(
      section.summary,
      `围绕“${section.title}”整理的讲义内容。`,
    ),
  }));
};

const buildStoryboard = (
  slides: OptimizedSlideRecord[],
  intentDraft: IntentDraft,
): VideoStoryboardScene[] => {
  if (slides.length === 0) {
    return [
      {
        id: "video-generated-summary",
        title: "视频脚本预览",
        summary:
          "当前视频部分仍为结构化预览，但已复用真实课件生成出的内容结构。",
        visualDirection: `建议沿用${intentDraft.outputStyle || "清晰"}风格，将生成的 PPT 结构改造成分镜脚本。`,
      },
    ];
  }

  return slides.map((slide, index) => {
    const title = slide.title?.trim() || `镜头 ${index + 1}`;
    const bullets = (slide.bullets ?? []).filter(Boolean);
    return {
      id: `scene-${slide.slide_index ?? index + 1}`,
      title,
      summary: clipText(
        bullets[0] ?? "",
        `围绕“${title}”设计视频讲解节奏与字幕内容。`,
      ),
      visualDirection: `建议按${intentDraft.outputStyle || "清晰"}风格呈现“${title}”，重点突出：${bullets[1] ?? bullets[0] ?? "核心知识点"}。`,
    };
  });
};

const buildResponseSummary = (
  payload: BackendCoursewareResponse,
  slides: OptimizedSlideRecord[],
) => {
  const slideCount = slides.length || payload.num_pages;
  return `已调用真实后端课件生成链路，生成项目 ${payload.project_id}。当前共整理 ${slideCount} 页结构预览，可下载 PPT 与教案文件继续查看成品。`;
};

const buildArtifactsFromBackend = async (
  payload: BackendCoursewareResponse,
  intentDraft: IntentDraft,
): Promise<StudioArtifacts> => {
  const optimizedSlides = await readOptimizedSlides(
    payload.optimized_structure_path,
  );
  const pptSlides = buildPreviewSlides(optimizedSlides, payload.topic);
  const lessonSections = buildLessonSections(optimizedSlides, intentDraft);
  const wordSections = buildWordSections(optimizedSlides, intentDraft);
  const storyboard = buildStoryboard(optimizedSlides, intentDraft);
  const updatedAt = new Date().toISOString();
  const pptFileName = payload.pptx_path
    ? path.basename(payload.pptx_path)
    : `${payload.project_id}.pptx`;
  const lessonPlanFileName = payload.lesson_plan_path
    ? path.basename(payload.lesson_plan_path)
    : `${payload.project_id}.docx`;

  return {
    "lesson-plan": {
      tab: "lesson-plan",
      title: "教案草案",
      description: "当前预览已接入后端真实教案生成流程。",
      updatedAt,
      downloadName: lessonPlanFileName,
      status: "ready",
      sections: lessonSections,
      slides: [],
      storyboard: [],
      previewHtml: payload.lesson_plan_path
        ? undefined
        : renderDemoDocumentPreviewHtml({
            label: "Lesson Plan",
            title: `${payload.topic}教案预览`,
            fileName: lessonPlanFileName,
            items: lessonSections.map((section) => ({
              title: section.title,
              body: section.body,
            })),
          }),
      download: payload.lesson_plan_path
        ? {
            fileName: lessonPlanFileName,
            contentType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            localPath: payload.lesson_plan_path,
          }
        : undefined,
    },
    ppt: {
      tab: "ppt",
      title: "PPT 预览",
      description: "当前预览来自后端真实生成的课件结构。",
      updatedAt,
      downloadName: pptFileName,
      status: "ready",
      sections: [],
      slides: pptSlides,
      storyboard: [],
      previewHtml: payload.pptx_path
        ? undefined
        : renderDemoPptPreviewHtml({
            topic: payload.topic,
            fileName: pptFileName,
            slides: optimizedSlides,
          }),
      download: payload.pptx_path
        ? {
            fileName: pptFileName,
            contentType:
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            localPath: payload.pptx_path,
          }
        : undefined,
    },
    video: {
      tab: "video",
      title: "视频脚本",
      description: "当前视频部分基于课件结构生成分镜预览。",
      updatedAt,
      downloadName: `${payload.project_id}-video-storyboard.json`,
      status: "ready",
      sections: [],
      slides: [],
      storyboard,
    },
    word: {
      tab: "word",
      title: "Word 讲义",
      description: "当前讲义预览与后端生成教案保持同源。",
      updatedAt,
      downloadName: lessonPlanFileName,
      status: "ready",
      sections: wordSections,
      slides: [],
      storyboard: [],
      previewHtml: payload.lesson_plan_path
        ? undefined
        : renderDemoDocumentPreviewHtml({
            label: "Handout",
            title: `${payload.topic}讲义预览`,
            fileName: lessonPlanFileName,
            items: wordSections.map((section) => ({
              title: section.title,
              body: section.body,
            })),
          }),
      download: payload.lesson_plan_path
        ? {
            fileName: lessonPlanFileName,
            contentType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            localPath: payload.lesson_plan_path,
          }
        : undefined,
    },
  };
};

const generateBackendArtifactsUncached = async ({
  request,
  intentDraft,
  assistantDraft,
}: {
  request: StudioArtifactRequest;
  intentDraft: IntentDraft;
  assistantDraft: string;
}) => {
  const topic = inferTopic(request, intentDraft, assistantDraft);
  const numPages = inferNumPages(intentDraft);
  const existingPayload = await resolveExistingBackendPayload({
    request,
    intentDraft,
    assistantDraft,
  });
  const multimodalMaterials = await resolveUsableMultimodalMaterials(
    request.materials,
  );
  const payload =
    existingPayload ??
    (await (async () => {
      const projectId =
        request.projectId ||
        buildStableProjectId(request, intentDraft, assistantDraft).projectId;

      const backendResponse =
        multimodalMaterials.length > 0
          ? await (async () => {
              const formData = new FormData();
              formData.append("topic", topic);
              formData.append("project_id", projectId);
              formData.append("num_pages", String(numPages));
              formData.append(
                "auto_online_image_search",
                String(backendAutoOnlineImageSearch),
              );
              formData.append(
                "auto_ai_image_generation",
                String(backendAutoAiImageGeneration),
              );
              formData.append(
                "message",
                buildMultimodalMaterialMessage(request, assistantDraft),
              );

              for (const material of multimodalMaterials) {
                formData.append(
                  "files",
                  new Blob([material.buffer], { type: material.mimeType }),
                  material.name,
                );
              }

              return fetch(backendCoursewareUploadEndpoint, {
                method: "POST",
                body: formData,
              });
            })()
          : await fetch(backendCoursewareEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topic,
                project_id: projectId,
                num_pages: numPages,
                auto_online_image_search: backendAutoOnlineImageSearch,
                auto_ai_image_generation: backendAutoAiImageGeneration,
                teaching_plan_markdown: assistantDraft.trim() || undefined,
              }),
            });

      if (!backendResponse.ok) {
        const detail = await backendResponse.text();
        throw new Error(detail || "backend courseware generation failed");
      }

      const acceptedPayload =
        (await backendResponse.json()) as BackendCoursewareResponse;

      return await waitForCompletedBackendPayload({
        projectId: acceptedPayload.project_id,
        topic,
        numPages,
      });
    })());
  const artifacts = await buildArtifactsFromBackend(payload, intentDraft);

  return {
    projectId: payload.project_id,
    intentDraft,
    artifacts,
    summary: buildResponseSummary(
      payload,
      await readOptimizedSlides(payload.optimized_structure_path),
    ),
  } satisfies StudioArtifactResponse;
};

export const resolveExistingBackendArtifactResponse = async ({
  request,
  intentDraft,
  assistantDraft,
}: {
  request: StudioArtifactRequest;
  intentDraft: IntentDraft;
  assistantDraft: string;
}) => {
  if (demoArtifactModeEnabled) {
    return resolveExistingDemoArtifactResponse({
      request,
      intentDraft,
    });
  }

  const payload = await resolveExistingBackendPayload({
    request,
    intentDraft,
    assistantDraft,
  });

  if (!payload) return null;

  const artifacts = await buildArtifactsFromBackend(payload, intentDraft);

  return {
    projectId: payload.project_id,
    intentDraft,
    artifacts,
    summary: buildResponseSummary(
      payload,
      await readOptimizedSlides(payload.optimized_structure_path),
    ),
  } satisfies StudioArtifactResponse;
};

export const resolveLatestCompletedBackendArtifactResponse = async ({
  request,
  intentDraft,
  assistantDraft,
}: {
  request: StudioArtifactRequest;
  intentDraft: IntentDraft;
  assistantDraft: string;
}) => {
  if (demoArtifactModeEnabled) {
    return resolveLatestCompletedDemoArtifactResponse({
      request,
      intentDraft,
    });
  }

  const topic = inferTopic(request, intentDraft, assistantDraft);
  const numPages = inferNumPages(intentDraft);
  const payload = await resolveLatestCompletedBackendPayload({
    topic,
    numPages,
  });

  if (!payload) return null;

  const artifacts = await buildArtifactsFromBackend(payload, intentDraft);

  return {
    projectId: payload.project_id,
    intentDraft,
    artifacts,
    summary: buildResponseSummary(
      payload,
      await readOptimizedSlides(payload.optimized_structure_path),
    ),
  } satisfies StudioArtifactResponse;
};

export const shouldGenerateCourseware = (
  request: StudioArtifactRequest,
  intentDraft: IntentDraft,
  assistantDraft: string,
) => {
  const hasAssistantDraft = assistantDraft.trim().length > 0;
  const hasLatestPrompt = request.latestPrompt.trim().length > 0;

  if (demoArtifactModeEnabled) {
    return triggerAfterAssistant
      ? hasAssistantDraft
      : hasLatestPrompt || hasAssistantDraft;
  }

  return (
    intentDraft.confirmed &&
    intentDraft.knowledgePoints.length > 0 &&
    (triggerAfterAssistant
      ? hasAssistantDraft
      : hasAssistantDraft || hasLatestPrompt)
  );
};

export const generateBackendArtifactResponse = async ({
  request,
  intentDraft,
  assistantDraft,
}: {
  request: StudioArtifactRequest;
  intentDraft: IntentDraft;
  assistantDraft: string;
}) => {
  const cacheKey = buildGenerationCacheKey(
    request,
    intentDraft,
    assistantDraft,
  );
  const cached = generationCache.get(cacheKey);
  if (cached) return cached;

  const task = (
    demoArtifactModeEnabled
      ? generateDemoArtifactResponseUncached({
          request,
          intentDraft,
        })
      : generateBackendArtifactsUncached({
          request,
          intentDraft,
          assistantDraft,
        })
  ).catch((error) => {
    generationCache.delete(cacheKey);
    throw error;
  });

  generationCache.set(cacheKey, task);
  return task;
};
