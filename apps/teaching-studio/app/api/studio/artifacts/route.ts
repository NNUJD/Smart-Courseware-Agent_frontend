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

const fallbackKnowledgePoints = ["概念导入", "核心知识讲解", "案例练习"];

const splitKeywords = (input: string) =>
  input
    .split(/[，,。；;\n]/)
    .map((value) => value.trim())
    .filter(Boolean);

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
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
};

const buildIntentDraft = (request: StudioArtifactRequest): IntentDraft => {
  const latestPrompt = request.latestPrompt;
  const existing = request.intentDraft;
  const materialKnowledge = request.materials.flatMap(
    (material) => material.linkedKnowledgePoints,
  );

  const teachingGoal =
    existing.teachingGoal ||
    extractBetween(latestPrompt, ["教学目标", "目标是", "希望达成"]) ||
    "围绕核心知识点完成一节可直接落地的课堂设计";
  const audience = existing.audience || inferAudience(latestPrompt);
  const duration = existing.duration || inferDuration(latestPrompt);
  const outputStyle = existing.outputStyle || inferStyle(latestPrompt);

  const detectedKnowledge = mergeUnique(
    existing.knowledgePoints,
    materialKnowledge,
    splitKeywords(
      extractBetween(latestPrompt, ["知识点", "重点内容", "围绕", "讲解"]),
    ),
  );

  const knowledgePoints =
    detectedKnowledge.length > 0 ? detectedKnowledge : fallbackKnowledgePoints;

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

const createArtifacts = (intent: IntentDraft): StudioArtifacts => {
  const lessonPlanSections = buildLessonPlanSections(intent);
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

const buildSummary = (intent: IntentDraft, activeTab: ArtifactTab) => {
  return `当前已整理出${intent.knowledgePoints.length}个知识点，并生成${tabLabels[activeTab]}方向的首版预览。${
    intent.missingFields.length > 0
      ? `仍建议补充：${intent.missingFields.join("、")}。`
      : "当前信息已满足继续细化修改。"
  }`;
};

export async function POST(request: Request) {
  const body = (await request.json()) as StudioArtifactRequest;
  const intentDraft = buildIntentDraft(body);
  const artifacts = createArtifacts(intentDraft);

  const response: StudioArtifactResponse = {
    intentDraft,
    artifacts,
    summary: buildSummary(intentDraft, body.activeTab),
  };

  return Response.json(response);
}
