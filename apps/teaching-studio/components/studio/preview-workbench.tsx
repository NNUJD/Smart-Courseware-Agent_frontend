"use client";

import Link from "next/link";
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
  Download,
  ExternalLink,
  Expand,
  Film,
  FileText,
  LayoutTemplate,
  LoaderCircle,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  Sparkles,
} from "lucide-react";
import { useComposerRuntime } from "@assistant-ui/react";
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

const visibleArtifactTabs = artifactTabs.filter(
  (tab): tab is Exclude<ArtifactTab, "word"> => tab !== "word",
);

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

const buildFilePreviewUrl = (localPath?: string) => {
  if (!localPath) return null;
  return `/api/studio/preview-file?path=${encodeURIComponent(localPath)}`;
};

const readFileNameFromDisposition = (header: string | null) => {
  if (!header) return null;
  const match = header.match(/filename="([^"]+)"/i);
  return match?.[1] ?? null;
};

export const PreviewWorkbench = () => {
  const fullscreenRef = useRef<HTMLElement>(null);
  const structureViewportRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPreviewSidebarOpen, setIsPreviewSidebarOpen] = useState(true);
  const [composerText, setComposerText] = useState("");
  const [structureScrollbar, setStructureScrollbar] = useState({
    visible: false,
    thumbHeight: 32,
    thumbTop: 0,
  });
  const composerRuntime = useComposerRuntime({ optional: true });
  const activeArtifact = useStudioStore((state) => state.activeArtifact);
  const selectedNodeIds = useStudioStore((state) => state.selectedNodeIds);
  const artifacts = useStudioStore((state) => state.artifacts);
  const isSyncing = useStudioStore((state) => state.isSyncing);
  const currentProjectId = useStudioStore((state) => state.currentProjectId);
  const latestPrompt = useStudioStore((state) => state.latestPrompt);
  const conversation = useStudioStore((state) => state.conversation);
  const intentDraft = useStudioStore((state) => state.intentDraft);
  const studioMaterials = useStudioStore((state) => state.materials);
  const setActiveArtifact = useStudioStore((state) => state.setActiveArtifact);
  const setSelectedNode = useStudioStore((state) => state.setSelectedNode);
  const applyArtifactResponse = useStudioStore(
    (state) => state.applyArtifactResponse,
  );
  const materials = useMemo(
    () =>
      studioMaterials.map((material) => ({
        id: material.id,
        name: material.name,
        mimeType: material.mimeType,
        size: material.size,
        storedPath: material.storedPath,
        role: material.role,
        linkedKnowledgePoints: material.linkedKnowledgePoints,
        note: material.note,
        parseSummary: material.parseSummary,
      })),
    [studioMaterials],
  );

  const artifact = artifacts[activeArtifact];

  useEffect(() => {
    if (activeArtifact === "word") {
      setActiveArtifact("lesson-plan");
    }
  }, [activeArtifact, setActiveArtifact]);

  const _hasGeneratingArtifacts = useMemo(
    () =>
      artifactTabs.some((tab) => artifacts[tab].status === "generating") ||
      artifactTabs.some(
        (tab) =>
          artifacts[tab].status === "ready" &&
          !artifacts[tab].download?.localPath &&
          (tab === "ppt" || tab === "lesson-plan" || tab === "word"),
      ),
    [artifacts],
  );
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
  const hasGeneratedFilePreview = Boolean(
    artifact.download?.localPath &&
      (activeArtifact === "ppt" ||
        activeArtifact === "lesson-plan" ||
        activeArtifact === "word"),
  );
  const previewHeading =
    currentTitle ??
    (hasGeneratedFilePreview
      ? artifact.downloadName || artifact.title
      : null) ??
    artifact.title;
  const hasPreview = Boolean(
    currentTitle || artifact.previewHtml || hasGeneratedFilePreview,
  );

  const queueFeedback = (template: string) => {
    const message = currentTitle
      ? `${template} 请重点修改“${currentTitle}”这一部分。`
      : template;
    const currentText = composerText.trim();

    if (!composerRuntime) return;

    composerRuntime.setText(
      currentText ? `${currentText}\n${message}` : message,
    );
  };

  const PanelIcon = panelIcons[activeArtifact];

  useEffect(() => {
    if (!composerRuntime) {
      setComposerText("");
      return;
    }

    const syncComposerText = () => {
      setComposerText(composerRuntime.getState().text ?? "");
    };

    syncComposerText();
    return composerRuntime.subscribe(syncComposerText);
  }, [composerRuntime]);

  const updateStructureScrollbar = useCallback(() => {
    const viewport = structureViewportRef.current;
    if (!viewport) return;

    const { scrollHeight, clientHeight, scrollTop } = viewport;
    const isScrollable = scrollHeight > clientHeight + 1;

    if (!isScrollable) {
      setStructureScrollbar((prev) => {
        if (!prev.visible && prev.thumbTop === 0) return prev;
        return { visible: false, thumbHeight: 32, thumbTop: 0 };
      });
      return;
    }

    const rawThumbHeight = (clientHeight / scrollHeight) * clientHeight;
    const thumbHeight = Math.max(30, Math.round(rawThumbHeight));
    const maxThumbTop = Math.max(0, clientHeight - thumbHeight);
    const thumbTop =
      scrollHeight === clientHeight
        ? 0
        : Math.round((scrollTop / (scrollHeight - clientHeight)) * maxThumbTop);

    setStructureScrollbar((prev) => {
      if (
        prev.visible &&
        prev.thumbHeight === thumbHeight &&
        prev.thumbTop === thumbTop
      ) {
        return prev;
      }

      return {
        visible: true,
        thumbHeight,
        thumbTop,
      };
    });
  }, []);

  const handleStructureThumbPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const viewport = structureViewportRef.current;
      if (!viewport) return;

      const { scrollHeight, clientHeight } = viewport;
      const scrollable = scrollHeight - clientHeight;
      if (scrollable <= 0) return;

      event.preventDefault();

      const rawThumbHeight = (clientHeight / scrollHeight) * clientHeight;
      const thumbHeight = Math.max(30, rawThumbHeight);
      const maxThumbTop = Math.max(1, clientHeight - thumbHeight);
      const startY = event.clientY;
      const startScrollTop = viewport.scrollTop;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const nextScrollTop =
          startScrollTop + (deltaY / maxThumbTop) * scrollable;
        viewport.scrollTop = Math.min(scrollable, Math.max(0, nextScrollTop));
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [],
  );

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

  const hasAnyGeneratingArtifacts = useMemo(
    () => artifactTabs.some((tab) => artifacts[tab].status === "generating"),
    [artifacts],
  );
  const hasAnyFileBackedArtifactNeedingRefresh = useMemo(
    () =>
      (["ppt", "lesson-plan", "word"] as const).some((tab) => {
        const candidate = artifacts[tab];
        return (
          !candidate.download?.localPath &&
          (candidate.status === "generating" || candidate.status === "ready")
        );
      }),
    [artifacts],
  );

  useEffect(() => {
    const shouldPollCurrentProject =
      Boolean(currentProjectId) &&
      (hasAnyGeneratingArtifacts || hasAnyFileBackedArtifactNeedingRefresh);

    if (!shouldPollCurrentProject || !currentProjectId) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/studio/artifacts", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            latestPrompt,
            projectId: currentProjectId,
            conversation:
              conversation.length > 0
                ? conversation
                : latestPrompt.trim().length > 0
                  ? [{ role: "user", text: latestPrompt }]
                  : [],
            intentDraft,
            materials,
            activeTab: activeArtifact,
          }),
        });

        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled) return;
        applyArtifactResponse(payload);
      } catch {
        return;
      }
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activeArtifact,
    applyArtifactResponse,
    conversation,
    currentProjectId,
    hasAnyGeneratingArtifacts,
    intentDraft,
    latestPrompt,
    materials,
    hasAnyFileBackedArtifactNeedingRefresh,
  ]);

  useEffect(() => {
    if (!isPreviewSidebarOpen) return;

    updateStructureScrollbar();

    const viewport = structureViewportRef.current;
    if (!viewport) return;

    window.addEventListener("resize", updateStructureScrollbar);

    if (typeof ResizeObserver === "undefined") {
      return () => {
        window.removeEventListener("resize", updateStructureScrollbar);
      };
    }

    const observer = new ResizeObserver(() => {
      updateStructureScrollbar();
    });

    observer.observe(viewport);
    const contentNode = viewport.firstElementChild;
    if (contentNode) {
      observer.observe(contentNode);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateStructureScrollbar);
    };
  }, [isPreviewSidebarOpen, updateStructureScrollbar]);

  return (
    <section className="flex min-h-0 flex-col border-border/60 border-t bg-card/75 backdrop-blur lg:border-t-0 lg:border-l">
      <header className="border-border/70 border-b px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 lg:w-[18rem] lg:flex-none xl:w-[20rem] 2xl:w-[22rem]">
            <p className="flex items-center gap-2 font-medium text-primary text-sm">
              <Sparkles className="size-4" />
              生成结果工作台
            </p>
            <h2 className="mt-1 font-semibold text-xl">
              右侧实时预览与反馈再生成
            </h2>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full px-3"
              onClick={() => setIsPreviewSidebarOpen((value) => !value)}
            >
              {isPreviewSidebarOpen ? (
                <PanelLeftClose className="size-4" />
              ) : (
                <PanelLeftOpen className="size-4" />
              )}
              {isPreviewSidebarOpen ? "收起侧栏" : "展开侧栏"}
            </Button>
            <nav className="inline-flex shrink-0 items-center rounded-full border border-border/70 bg-background/80 p-1">
              {visibleArtifactTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveArtifact(tab)}
                  className={cn(
                    "rounded-full px-3 py-2 text-sm transition-colors",
                    activeArtifact === tab
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tabLabels[tab]}
                </button>
              ))}
              <Link
                href="/virtual-labs/buoyancy"
                className="rounded-full px-3 py-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
              >
                仿真
              </Link>
            </nav>
            <div className="shrink-0">
              <ExportButton />
            </div>
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
              <div className="relative mt-3">
                <div
                  ref={structureViewportRef}
                  onScroll={updateStructureScrollbar}
                  className={cn(
                    "space-y-2 pr-4",
                    listItems.length > 0 && "max-h-[54vh] overflow-y-auto",
                  )}
                >
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

                {structureScrollbar.visible ? (
                  <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-3">
                    <div className="absolute top-0 right-[5px] bottom-0 w-px bg-border/80" />
                    <button
                      type="button"
                      onPointerDown={handleStructureThumbPointerDown}
                      className="pointer-events-auto absolute right-0 w-3 rounded-full bg-primary/40 transition-colors hover:bg-primary/55 active:bg-primary/70"
                      style={{
                        height: `${structureScrollbar.thumbHeight}px`,
                        transform: `translateY(${structureScrollbar.thumbTop}px)`,
                      }}
                      aria-label="拖动滚动预览结构"
                    />
                  </div>
                ) : null}
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
          <ArtifactPreviewSurface
            activeArtifact={activeArtifact}
            artifact={artifact}
            currentScene={currentScene}
            currentSection={currentSection}
            currentSlide={currentSlide}
            hasPreview={hasPreview}
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
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
  hasPreview?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  expanded?: boolean;
};

const ArtifactPreviewSurface: FC<ArtifactPreviewSurfaceProps> = ({
  activeArtifact,
  artifact,
  currentSection,
  currentSlide,
  currentScene,
  hasPreview = false,
  isFullscreen = false,
  onToggleFullscreen,
  expanded = false,
}) => {
  const filePreviewUrl = buildFilePreviewUrl(artifact.download?.localPath);
  const inlinePreviewHtml = artifact.previewHtml?.trim() || null;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFileExporting, setIsFileExporting] = useState(false);
  const activeArtifactFromStore = useStudioStore(
    (state) => state.activeArtifact,
  );
  const artifacts = useStudioStore((state) => state.artifacts);
  const materials = useStudioStore((state) => state.materials);
  const intentDraft = useStudioStore((state) => state.intentDraft);
  const currentProjectId = useStudioStore((state) => state.currentProjectId);
  const latestPrompt = useStudioStore((state) => state.latestPrompt);
  const conversation = useStudioStore((state) => state.conversation);

  const handleDirectExport = useCallback(async () => {
    setIsFileExporting(true);

    try {
      const response = await fetch("/api/studio/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          activeArtifact: activeArtifactFromStore,
          projectId: currentProjectId || undefined,
          intentDraft,
          materials,
          artifacts,
          latestPrompt,
          conversation,
        }),
      });

      if (!response.ok) {
        throw new Error("export_failed");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download =
        readFileNameFromDisposition(
          response.headers.get("Content-Disposition"),
        ) ?? artifact.downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setIsFileExporting(false);
    }
  }, [
    activeArtifactFromStore,
    artifact.downloadName,
    artifacts,
    conversation,
    currentProjectId,
    intentDraft,
    latestPrompt,
    materials,
  ]);

  const handlePrintPreview = useCallback(() => {
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentWindow?.print();
  }, []);

  if (
    filePreviewUrl &&
    (activeArtifact === "ppt" ||
      activeArtifact === "lesson-plan" ||
      activeArtifact === "word")
  ) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 flex-col gap-3 overflow-hidden",
          expanded ? "min-h-[78vh]" : "min-h-[560px]",
        )}
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] border border-border/70 bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.16),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] shadow-sm">
          <div className="border-border/60 border-b px-4 py-3">
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
              <div className="min-w-0 text-base font-semibold">
                当前查看 {artifact.downloadName}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => void handleDirectExport()}
                  disabled={isFileExporting}
                >
                  {isFileExporting ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  下载文件
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={!hasPreview}
                  onClick={() => onToggleFullscreen?.()}
                >
                  {isFullscreen ? (
                    <Minimize2 className="size-4" />
                  ) : (
                    <Expand className="size-4" />
                  )}
                  {isFullscreen ? "退出全屏" : "放大预览"}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
            <iframe
              ref={iframeRef}
              title={`${artifact.title}真实文件预览`}
              src={filePreviewUrl}
              className={cn(
                "min-h-0 w-full flex-1 rounded-[22px] border border-border/70 bg-white shadow-inner",
                expanded ? "h-[70vh]" : "h-[480px]",
              )}
            />
          </div>
        </div>
      </div>
    );
  }

  if (inlinePreviewHtml) {
    const allowPrint = activeArtifact !== "video";

    return (
      <div
        className={cn(
          "flex h-full flex-col gap-3",
          expanded ? "min-h-[78vh]" : "min-h-[560px]",
        )}
      >
        <div className="relative flex-1 overflow-hidden rounded-[30px] border border-border/70 bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.16),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] shadow-sm">
          <div className="border-border/60 border-b px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="font-semibold text-lg">{artifact.title}</h3>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 text-xs">
                  <CheckCircle2 className="size-3.5" />
                  已生成完成
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs">
                  {artifact.downloadName}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {artifact.download?.localPath ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => void handleDirectExport()}
                  disabled={isFileExporting}
                >
                  {isFileExporting ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  下载文件
                </Button>
              ) : null}
              {allowPrint ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={handlePrintPreview}
                >
                  <Printer className="size-4" />
                  打印预览
                </Button>
              ) : null}
            </div>
          </div>

          <div className="p-3">
            <div className="mb-3 flex items-center gap-2 px-2">
              <span className="size-2.5 rounded-full bg-rose-400/90" />
              <span className="size-2.5 rounded-full bg-amber-400/90" />
              <span className="size-2.5 rounded-full bg-emerald-400/90" />
              <div className="ml-2 flex-1 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-muted-foreground text-xs">
                {artifact.downloadName}
              </div>
            </div>

            <iframe
              ref={iframeRef}
              title={`${artifact.title}预览`}
              srcDoc={withAdaptivePreviewMedia(inlinePreviewHtml)}
              className={cn(
                "w-full rounded-[22px] border border-border/70 bg-white shadow-inner",
                expanded ? "min-h-[70vh]" : "min-h-[480px]",
              )}
            />
          </div>
        </div>
      </div>
    );
  }

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
        {artifact.status === "generating" ? (
          <>
            <p className="font-medium">当前暂无可预览内容</p>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              左侧会持续展示当前任务状态；当文件真正生成完成后，右侧会自动切换到对应的文件预览。
            </p>
          </>
        ) : artifact.status === "error" ? (
          <>
            <p className="font-medium">生成暂时失败</p>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              这轮生成没有成功完成。你可以重新发起一次生成，或继续调整需求后再试。
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">等待生成首版结果</p>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              当左侧完成教学目标、知识点、资料用途和产出风格的澄清后，右侧会显示可修改的教案、PPT
              和视频预览。
            </p>
          </>
        )}
      </div>
    </div>
  );
};
