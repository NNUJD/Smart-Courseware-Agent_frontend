"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";
import {
  CheckCircle2,
  Expand,
  Film,
  FileText,
  LayoutTemplate,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react";
import { useComposer, useComposerRuntime } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  artifactTabs,
  type ArtifactPreview,
  type ArtifactTab,
  type PreviewSection,
  type PreviewSlide,
  type VideoStoryboardScene,
} from "@/lib/studio-contract";
import { useStudioStore } from "@/lib/studio-store";
import { ExportButton } from "./export-button";

const tabLabels: Record<ArtifactTab, string> = {
  "lesson-plan": "教案",
  ppt: "PPT",
  video: "视频",
  word: "Word",
};

const feedbackTemplates: Record<ArtifactTab, string[]> = {
  "lesson-plan": [
    "请把教学流程调整为“导入 - 探究 - 练习 - 总结”的顺序。",
    "请把重点难点写得更清晰一些。",
    "请增加一个贴近课堂的案例讨论环节。",
  ],
  ppt: [
    "请调整页面顺序，让讲解逻辑更顺。",
    "请把当前页面再简化一些，突出核心知识点。",
    "请增加一页课堂互动案例，并给出板书提示。",
  ],
  video: [
    "请把视频节奏调得更轻快一些，适合导入环节。",
    "请补一个用于激发兴趣的开场镜头脚本。",
    "请把解说词改得更适合小学课堂。",
  ],
  word: [
    "请把讲义改成教师可直接打印的双栏格式。",
    "请补充每个知识点对应的练习提示。",
    "请把语言风格改得更正式，便于教研存档。",
  ],
};

const panelIcons = {
  "lesson-plan": FileText,
  ppt: LayoutTemplate,
  video: Film,
  word: FileText,
} satisfies Record<ArtifactTab, typeof LayoutTemplate>;

const withAdaptivePreviewMedia = (html: string) => {
  const marker = "data-preview-adaptive-media";
  if (html.includes(marker)) return html;

  const style = `<style ${marker}>
  html, body {
    max-width: 100%;
  }
  img, video, svg, canvas, object, embed {
    display: block;
    max-width: 100% !important;
    max-height: 100% !important;
    height: auto !important;
    object-fit: contain;
  }
  figure {
    max-width: 100% !important;
  }
  </style>`;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${style}</head>`);
  }

  return `${style}${html}`;
};

export const PreviewWorkbench = () => {
  const fullscreenRef = useRef<HTMLElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPreviewSidebarOpen, setIsPreviewSidebarOpen] = useState(true);
  const composerRuntime = useComposerRuntime();
  const composerText = useComposer((state) => state.text);
  const activeArtifact = useStudioStore((state) => state.activeArtifact);
  const selectedNodeIds = useStudioStore((state) => state.selectedNodeIds);
  const artifacts = useStudioStore((state) => state.artifacts);
  const isSyncing = useStudioStore((state) => state.isSyncing);
  const previewSummary = useStudioStore((state) => state.previewSummary);
  const setActiveArtifact = useStudioStore((state) => state.setActiveArtifact);
  const setSelectedNode = useStudioStore((state) => state.setSelectedNode);

  const artifact = artifacts[activeArtifact];
  const listItems = useMemo(() => {
    if (artifact.slides.length > 0) {
      return artifact.slides.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.caption,
      }));
    }

    if (artifact.storyboard.length > 0) {
      return artifact.storyboard.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
      }));
    }

    return artifact.sections.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
    }));
  }, [artifact]);

  const selectedNodeId =
    selectedNodeIds[activeArtifact] ?? listItems[0]?.id ?? undefined;

  const currentSection = artifact.sections.find(
    (section) => section.id === selectedNodeId,
  );
  const currentSlide = artifact.slides.find(
    (slide) => slide.id === selectedNodeId,
  );
  const currentScene = artifact.storyboard.find(
    (scene) => scene.id === selectedNodeId,
  );

  const currentTitle =
    currentSection?.title ?? currentSlide?.title ?? currentScene?.title;
  const hasPreview = Boolean(currentTitle);

  const queueFeedback = (template: string) => {
    const message = currentTitle
      ? `${template} 请重点修改“${currentTitle}”这一部分。`
      : template;
    const currentText = composerText.trim();

    composerRuntime.setText(
      currentText ? `${currentText}\n${message}` : message,
    );
  };

  const PanelIcon = panelIcons[activeArtifact];

  const handleToggleFullscreen = useCallback(async () => {
    if (!fullscreenRef.current || !hasPreview) return;

    try {
      if (document.fullscreenElement === fullscreenRef.current) {
        await document.exitFullscreen();
        return;
      }

      await fullscreenRef.current.requestFullscreen();
    } catch {
      return;
    }
  }, [hasPreview]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === fullscreenRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return (
    <section className="flex min-h-0 flex-col border-border/60 border-t bg-card/75 backdrop-blur lg:border-t-0 lg:border-l">
      <header className="border-border/70 border-b px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 font-medium text-primary text-sm">
              <Sparkles className="size-4" />
              生成结果工作台
            </p>
            <h2 className="mt-1 font-semibold text-xl">
              右侧实时预览与反馈再生成
            </h2>
            <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-6">
              {previewSummary}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setIsPreviewSidebarOpen((value) => !value)}
            >
              {isPreviewSidebarOpen ? (
                <PanelLeftClose className="size-4" />
              ) : (
                <PanelLeftOpen className="size-4" />
              )}
              {isPreviewSidebarOpen ? "收起侧栏" : "展开侧栏"}
            </Button>
            <nav className="inline-flex rounded-full border border-border/70 bg-background/80 p-1">
              {artifactTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveArtifact(tab)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm transition-colors",
                    activeArtifact === tab
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tabLabels[tab]}
                </button>
              ))}
            </nav>
            <ExportButton />
          </div>
        </div>
      </header>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-4 p-4",
          isPreviewSidebarOpen
            ? "xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)]"
            : "grid-cols-1",
        )}
      >
        {isPreviewSidebarOpen ? (
          <aside className="flex min-h-0 flex-col gap-4">
            <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-accent p-2 text-accent-foreground">
                  <PanelIcon className="size-5" />
                </div>
                <div>
                  <p className="font-medium text-sm">{artifact.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {artifact.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    "rounded-full px-2 py-1",
                    artifact.status === "ready" &&
                      "bg-emerald-100 text-emerald-700",
                    artifact.status === "generating" &&
                      "bg-amber-100 text-amber-700",
                    artifact.status === "error" && "bg-rose-100 text-rose-700",
                    artifact.status === "idle" &&
                      "bg-secondary text-secondary-foreground",
                  )}
                >
                  {artifact.status === "ready"
                    ? "已生成"
                    : artifact.status === "generating"
                      ? "生成中"
                      : artifact.status === "error"
                        ? "异常"
                        : "待生成"}
                </span>
                {isSyncing ? (
                  <span className="text-muted-foreground">同步中...</span>
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
              <p className="font-medium text-sm">预览结构</p>
              <div className="mt-3 space-y-2">
                {listItems.length > 0 ? (
                  listItems.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedNode(activeArtifact, item.id)}
                      className={cn(
                        "block w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                        selectedNodeId === item.id
                          ? "border-primary bg-primary/8"
                          : "border-border/60 bg-background hover:border-primary/50",
                      )}
                    >
                      <p className="text-muted-foreground text-xs">
                        {activeArtifact === "ppt"
                          ? `第 ${index + 1} 页`
                          : activeArtifact === "video"
                            ? `镜头 ${index + 1}`
                            : `模块 ${index + 1}`}
                      </p>
                      <p className="mt-1 font-medium text-sm">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-muted-foreground text-xs leading-5">
                        {item.summary}
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="rounded-2xl border border-border/60 border-dashed px-3 py-4 text-muted-foreground text-sm">
                    完成一轮需求澄清后，这里会出现章节、页面或视频分镜。
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
              <p className="font-medium text-sm">快捷修改建议</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {feedbackTemplates[activeArtifact].map((template) => (
                  <button
                    key={template}
                    type="button"
                    onClick={() => queueFeedback(template)}
                    className="rounded-full border border-border/70 bg-background px-3 py-2 text-left text-xs transition-colors hover:border-primary/60 hover:bg-primary/5"
                  >
                    {template}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        ) : null}

        <main
          ref={fullscreenRef}
          className={cn(
            "min-h-0 rounded-[28px] border border-border/70 bg-background/85 p-4 shadow-sm lg:p-5",
            isFullscreen &&
              "h-screen w-screen rounded-none border-0 p-6 shadow-none",
          )}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-muted-foreground text-xs">当前查看</p>
              <h3 className="font-semibold text-lg">
                {currentTitle ?? "等待首版预览结果"}
              </h3>
            </div>

            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={!hasPreview}
              onClick={() => void handleToggleFullscreen()}
            >
              {isFullscreen ? (
                <Minimize2 className="size-4" />
              ) : (
                <Expand className="size-4" />
              )}
              {isFullscreen ? "退出全屏" : "放大预览"}
            </Button>
          </div>

          <ArtifactPreviewSurface
            activeArtifact={activeArtifact}
            artifact={artifact}
            currentScene={currentScene}
            currentSection={currentSection}
            currentSlide={currentSlide}
            expanded={isFullscreen}
          />
        </main>
      </div>
    </section>
  );
};

type ArtifactPreviewSurfaceProps = {
  activeArtifact: ArtifactTab;
  artifact: ArtifactPreview;
  currentSection?: PreviewSection;
  currentSlide?: PreviewSlide;
  currentScene?: VideoStoryboardScene;
  expanded?: boolean;
};

const ArtifactPreviewSurface: FC<ArtifactPreviewSurfaceProps> = ({
  activeArtifact,
  artifact,
  currentSection,
  currentSlide,
  currentScene,
  expanded = false,
}) => {
  if (activeArtifact === "ppt" && currentSlide) {
    return (
      <div
        className={cn(
          "flex h-full flex-col gap-3",
          expanded ? "min-h-[78vh]" : "min-h-[560px]",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs">PPT 页面预览</p>
            <h3 className="font-semibold text-lg">{currentSlide.title}</h3>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs">
            <CheckCircle2 className="size-3.5 text-primary" />
            {artifact.downloadName}
          </span>
        </div>

        <iframe
          title={currentSlide.title}
          srcDoc={withAdaptivePreviewMedia(currentSlide.html)}
          className={cn(
            "w-full flex-1 rounded-[24px] border border-border/70 bg-white",
            expanded ? "min-h-[70vh]" : "min-h-[480px]",
          )}
        />
      </div>
    );
  }

  if (activeArtifact === "video" && currentScene) {
    return (
      <div
        className={cn(
          "grid gap-4",
          expanded
            ? "min-h-[78vh] xl:grid-cols-[minmax(0,1fr)_320px]"
            : "min-h-[560px] xl:grid-cols-[minmax(0,1fr)_260px]",
        )}
      >
        <div className="rounded-[24px] border border-border/70 bg-secondary/60 p-5">
          <p className="text-muted-foreground text-xs">视频脚本预览</p>
          <h3 className="mt-1 font-semibold text-lg">{currentScene.title}</h3>
          <p className="mt-3 leading-7">{currentScene.summary}</p>

          <div className="mt-6 rounded-[24px] bg-[radial-gradient(circle_at_top,#ffffff,transparent_56%),linear-gradient(135deg,#13315c,#3273dc,#72c2ff)] p-6 text-white shadow-inner">
            <p className="text-white/75 text-xs uppercase tracking-[0.24em]">
              Storyboard Preview
            </p>
            <p className="mt-4 font-medium text-2xl">{currentScene.title}</p>
            <p className="mt-3 max-w-xl text-sm text-white/86 leading-7">
              {currentScene.visualDirection}
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-border/70 bg-background/80 p-5">
          <p className="text-muted-foreground text-xs">镜头说明</p>
          <p className="mt-2 text-sm leading-7">
            {currentScene.visualDirection}
          </p>
        </div>
      </div>
    );
  }

  if (currentSection) {
    return (
      <article
        className={cn(
          "mx-auto rounded-[24px] border border-border/60 bg-card/90 shadow-sm",
          expanded ? "max-w-5xl p-8" : "max-w-4xl p-6",
        )}
      >
        <p className="text-muted-foreground text-xs">
          {activeArtifact === "lesson-plan" ? "教案模块" : "讲义章节"}
        </p>
        <h3 className="mt-1 font-semibold text-xl">{currentSection.title}</h3>
        {currentSection.duration ? (
          <p className="mt-2 text-muted-foreground text-sm">
            建议时长：{currentSection.duration}
          </p>
        ) : null}
        <p className="mt-4 text-muted-foreground text-sm leading-7">
          {currentSection.summary}
        </p>
        <div className="mt-6 whitespace-pre-wrap text-sm leading-8">
          {currentSection.body}
        </div>
      </article>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-[24px] border border-border/70 border-dashed bg-secondary/40 p-10 text-center",
        expanded ? "min-h-[78vh]" : "min-h-[560px]",
      )}
    >
      <div className="max-w-md">
        <p className="font-medium">等待生成首版结果</p>
        <p className="mt-2 text-muted-foreground text-sm leading-6">
          当左侧完成教学目标、知识点、资料用途和产出风格的澄清后，右侧会显示可修改的教案、PPT、视频和
          Word 预览。
        </p>
      </div>
    </div>
  );
};
