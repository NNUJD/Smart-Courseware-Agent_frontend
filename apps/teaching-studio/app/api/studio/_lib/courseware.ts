import { createHash } from "node:crypto";
import { access, readFile, readdir, stat } from "node:fs/promises";
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
};

type OptimizedSlideRecord = {
  slide_index?: number;
  title?: string;
  slide_type?: string;
  bullets?: string[];
};

const backendBaseUrl =
  process.env.TEACHING_BACKEND_BASE_URL ?? "http://127.0.0.1:8000";
const backendCoursewareEndpoint = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/courseware/generate`;
const backendArtifactRoot =
  process.env.TEACHING_BACKEND_ARTIFACT_ROOT ??
  path.resolve(
    process.cwd(),
    "../Smart-Courseware-Agent_backend/backend/app/agent/data_assets/demo_show",
  );

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
        (candidate) =>
          candidate && !isFeedbackPlaceholderTopic(candidate),
      ) ?? "";
  const cleanKnowledgeTopic = pickCleanKnowledgeTopic(
    intentDraft.knowledgePoints,
  );
  const candidate =
    (quotedTopic && !isFeedbackPlaceholderTopic(quotedTopic) ? quotedTopic : "") ||
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

const resolveExistingBackendPayloadByIntent = async ({
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
  const payload =
    existingPayload ??
    (await (async () => {
      const projectId =
        request.projectId ||
        buildStableProjectId(request, intentDraft, assistantDraft).projectId;

      const backendResponse = await fetch(backendCoursewareEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          project_id: projectId,
          num_pages: numPages,
          auto_online_image_search: true,
          auto_ai_image_generation: false,
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
  return (
    intentDraft.confirmed &&
    intentDraft.knowledgePoints.length > 0 &&
    (assistantDraft.trim().length > 0 || request.latestPrompt.trim().length > 0)
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

  const task = generateBackendArtifactsUncached({
    request,
    intentDraft,
    assistantDraft,
  }).catch((error) => {
    generationCache.delete(cacheKey);
    throw error;
  });

  generationCache.set(cacheKey, task);
  return task;
};
