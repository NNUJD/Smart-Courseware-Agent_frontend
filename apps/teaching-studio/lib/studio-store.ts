"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  ArtifactPreview,
  ArtifactTab,
  IntentDraft,
  MaterialRole,
  StudioArtifactResponse,
  StudioArtifacts,
  StudioConversationTurn,
  StudioMaterial,
} from "./studio-contract";

const createEmptyIntentDraft = (): IntentDraft => ({
  teachingGoal: "",
  audience: "",
  duration: "",
  knowledgePoints: [],
  logicSequence: [],
  keyDifficulties: [],
  outputStyle: "",
  finalRequirement: "",
  missingFields: [
    "教学目标",
    "目标学段/对象",
    "核心知识点",
    "课时或时长",
    "产出风格",
  ],
  confirmed: false,
});

const createIdleArtifact = (
  tab: ArtifactTab,
  title: string,
  description: string,
  downloadName: string,
): ArtifactPreview => ({
  tab,
  title,
  description,
  downloadName,
  status: "idle",
  sections: [],
  slides: [],
  storyboard: [],
});

const createIdleArtifacts = (): StudioArtifacts => ({
  "lesson-plan": createIdleArtifact(
    "lesson-plan",
    "教案草案",
    "等待教学需求澄清后生成教案结构。",
    "lesson-plan-draft.json",
  ),
  ppt: createIdleArtifact(
    "ppt",
    "PPT 预览",
    "等待知识点和讲授逻辑后生成课件页面。",
    "slides-draft.json",
  ),
  video: createIdleArtifact(
    "video",
    "视频脚本",
    "等待教学风格和镜头节奏后生成视频分镜。",
    "video-storyboard-draft.json",
  ),
  word: createIdleArtifact(
    "word",
    "Word 讲义",
    "等待资料解析完成后生成讲义正文。",
    "handout-draft.json",
  ),
});

const SAMPLE_PDF_PATH =
  "C:\\Users\\陈韦烨\\Documents\\trae_projects\\teacher_studio\\Smart-Courseware-Agent_backend_main\\test_files\\test_with_text.pdf";

const createSamplePptArtifact = (): ArtifactPreview => ({
  ...createIdleArtifact(
    "ppt",
    "PPT 预览",
    "工作台样例 PDF 预览。",
    "test_with_text.pdf",
  ),
  status: "ready",
  download: {
    fileName: "test_with_text.pdf",
    contentType: "application/pdf",
    localPath: SAMPLE_PDF_PATH,
  },
});

const hasArtifactRenderableContent = (artifact: ArtifactPreview) =>
  artifact.sections.length > 0 ||
  artifact.slides.length > 0 ||
  artifact.storyboard.length > 0 ||
  Boolean(artifact.previewHtml) ||
  Boolean(artifact.download?.localPath);

const _hasAnyRenderableArtifacts = (artifacts: StudioArtifacts) =>
  (Object.keys(artifacts) as ArtifactTab[]).some((tab) =>
    hasArtifactRenderableContent(artifacts[tab]),
  );

const shouldKeepCurrentArtifact = (
  currentArtifact: ArtifactPreview,
  incomingArtifact: ArtifactPreview,
) => {
  if (
    incomingArtifact.status === "ready" &&
    (Boolean(incomingArtifact.download?.localPath) ||
      Boolean(incomingArtifact.previewHtml) ||
      hasArtifactRenderableContent(incomingArtifact))
  ) {
    return false;
  }

  if (!hasArtifactRenderableContent(currentArtifact)) return false;

  if (incomingArtifact.status === "idle") {
    return !hasArtifactRenderableContent(incomingArtifact);
  }

  if (incomingArtifact.status === "generating") {
    return !hasArtifactRenderableContent(incomingArtifact);
  }

  return false;
};

const toGeneratingArtifact = (artifact: ArtifactPreview): ArtifactPreview => ({
  ...artifact,
  status: "generating",
  sections: [],
  slides: [],
  storyboard: [],
  download: undefined,
});

const defaultPreviewSummary =
  "先通过多轮对话明确教学目标，再逐步生成教案、PPT、视频和讲义预览。";

const normalizeConversationText = (input: string) =>
  input
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

const normalizeConversationComparisonText = (input: string) =>
  normalizeConversationText(input).replace(/\s+/g, "");

const isStreamingGrowthVariant = (left: string, right: string) => {
  const normalizedLeft = normalizeConversationComparisonText(left);
  const normalizedRight = normalizeConversationComparisonText(right);

  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;

  return (
    normalizedLeft.startsWith(normalizedRight) ||
    normalizedRight.startsWith(normalizedLeft)
  );
};

const sameConversation = (
  left: StudioConversationTurn[],
  right: StudioConversationTurn[],
) => {
  if (left.length !== right.length) return false;

  return left.every(
    (item, index) =>
      item.role === right[index]?.role && item.text === right[index]?.text,
  );
};

const sanitizeConversationHistory = (
  conversation: StudioConversationTurn[],
) => {
  return conversation.reduce<StudioConversationTurn[]>((result, turn) => {
    if (turn.role !== "assistant" && turn.role !== "user") {
      return result;
    }

    const text = normalizeConversationText(turn.text);
    if (!text) return result;

    const normalizedTurn = {
      role: turn.role,
      text,
    } satisfies StudioConversationTurn;
    const previousTurn = result.at(-1);

    if (!previousTurn) {
      return [normalizedTurn];
    }

    if (previousTurn.role !== normalizedTurn.role) {
      result.push(normalizedTurn);
      return result;
    }

    if (isStreamingGrowthVariant(previousTurn.text, normalizedTurn.text)) {
      const keepCurrent =
        normalizeConversationComparisonText(normalizedTurn.text).length >=
        normalizeConversationComparisonText(previousTurn.text).length;

      return keepCurrent ? [...result.slice(0, -1), normalizedTurn] : result;
    }

    if (previousTurn.text === normalizedTurn.text) {
      return result;
    }

    result.push(normalizedTurn);
    return result;
  }, []);
};

const createInitialWorkspaceState = () => ({
  activeArtifact: "ppt" as ArtifactTab,
  selectedNodeIds: {} as Partial<Record<ArtifactTab, string>>,
  isSyncing: false,
  previewSummary: defaultPreviewSummary,
  intentDraft: createEmptyIntentDraft(),
  materials: [] as StudioMaterial[],
  artifacts: {
    ...createIdleArtifacts(),
    ppt: createSamplePptArtifact(),
  },
  currentProjectId: "",
  latestPrompt: "",
  conversation: [] as StudioConversationTurn[],
});

type StudioState = {
  activeArtifact: ArtifactTab;
  selectedNodeIds: Partial<Record<ArtifactTab, string>>;
  isSyncing: boolean;
  previewSummary: string;
  intentDraft: IntentDraft;
  materials: StudioMaterial[];
  artifacts: StudioArtifacts;
  currentProjectId: string;
  latestPrompt: string;
  conversation: StudioConversationTurn[];
  setActiveArtifact(tab: ArtifactTab): void;
  setSelectedNode(tab: ArtifactTab, nodeId: string): void;
  setCurrentProjectId(projectId: string): void;
  setSyncContext(context: {
    latestPrompt: string;
    conversation: StudioConversationTurn[];
  }): void;
  startSync(): void;
  syncFailed(message: string): void;
  applyArtifactResponse(response: StudioArtifactResponse): void;
  addMaterial(material: StudioMaterial): void;
  updateMaterialRole(id: string, role: MaterialRole): void;
  updateMaterialKnowledgePoints(id: string, points: string[]): void;
  updateMaterialNote(id: string, note: string): void;
  removeMaterial(id: string): void;
  resetWorkspace(): void;
};

export const useStudioStore = create<StudioState>()(
  persist(
    (set) => ({
      ...createInitialWorkspaceState(),
      setActiveArtifact: (tab) => set({ activeArtifact: tab }),
      setSelectedNode: (tab, nodeId) =>
        set((state) => ({
          selectedNodeIds: {
            ...state.selectedNodeIds,
            [tab]: nodeId,
          },
        })),
      setCurrentProjectId: (projectId) => set({ currentProjectId: projectId }),
      setSyncContext: ({ latestPrompt, conversation }) =>
        set((state) => {
          const sanitizedConversation =
            sanitizeConversationHistory(conversation);
          const samePrompt = state.latestPrompt === latestPrompt;
          const sameThread = sameConversation(
            sanitizeConversationHistory(state.conversation),
            sanitizedConversation,
          );

          if (samePrompt) {
            if (sameThread) {
              return {
                latestPrompt,
                conversation: sanitizedConversation,
              };
            }

            return {
              latestPrompt,
              conversation: sanitizedConversation,
            };
          }

          return {
            latestPrompt,
            conversation: sanitizedConversation,
            currentProjectId: "",
            selectedNodeIds: {},
            previewSummary: defaultPreviewSummary,
            artifacts: createIdleArtifacts(),
          };
        }),
      startSync: () =>
        set((state) => ({
          isSyncing: true,
          artifacts: {
            "lesson-plan": toGeneratingArtifact(state.artifacts["lesson-plan"]),
            ppt: toGeneratingArtifact(state.artifacts.ppt),
            video: toGeneratingArtifact(state.artifacts.video),
            word: toGeneratingArtifact(state.artifacts.word),
          },
        })),
      syncFailed: (message) =>
        set((state) => ({
          isSyncing: false,
          previewSummary: message,
          artifacts: {
            "lesson-plan": {
              ...state.artifacts["lesson-plan"],
              status: "error",
            },
            ppt: {
              ...state.artifacts.ppt,
              status: "error",
            },
            video: {
              ...state.artifacts.video,
              status: "error",
            },
            word: {
              ...state.artifacts.word,
              status: "error",
            },
          },
        })),
      applyArtifactResponse: (response) =>
        set((state) => {
          const selectedNodeIds = { ...state.selectedNodeIds };
          const nextArtifacts = {} as StudioArtifacts;

          for (const tab of Object.keys(response.artifacts) as ArtifactTab[]) {
            const incomingArtifact = response.artifacts[tab];
            const currentArtifact = state.artifacts[tab];
            const artifact = shouldKeepCurrentArtifact(
              currentArtifact,
              incomingArtifact,
            )
              ? {
                  ...currentArtifact,
                  status:
                    incomingArtifact.status === "generating"
                      ? ("generating" as const)
                      : currentArtifact.status,
                  title: incomingArtifact.title || currentArtifact.title,
                  description:
                    incomingArtifact.description || currentArtifact.description,
                  downloadName:
                    incomingArtifact.downloadName ||
                    currentArtifact.downloadName,
                  updatedAt:
                    incomingArtifact.updatedAt ?? currentArtifact.updatedAt,
                }
              : incomingArtifact.status === "ready" ||
                  incomingArtifact.status === "error" ||
                  !hasArtifactRenderableContent(currentArtifact)
                ? incomingArtifact
                : incomingArtifact.status === "generating"
                  ? {
                      ...currentArtifact,
                      status: "generating" as const,
                      title: incomingArtifact.title,
                      description: incomingArtifact.description,
                      downloadName: incomingArtifact.downloadName,
                      updatedAt:
                        incomingArtifact.updatedAt ?? currentArtifact.updatedAt,
                    }
                  : currentArtifact;

            nextArtifacts[tab] = artifact;
            const existingSelection = state.selectedNodeIds[tab];
            const availableNodeIds = [
              ...artifact.sections.map((item) => item.id),
              ...artifact.slides.map((item) => item.id),
              ...artifact.storyboard.map((item) => item.id),
            ];

            if (
              existingSelection &&
              availableNodeIds.includes(existingSelection)
            ) {
              selectedNodeIds[tab] = existingSelection;
              continue;
            }

            selectedNodeIds[tab] =
              artifact.sections[0]?.id ??
              artifact.slides[0]?.id ??
              artifact.storyboard[0]?.id;
          }

          return {
            isSyncing: (Object.keys(nextArtifacts) as ArtifactTab[]).some(
              (tab) => nextArtifacts[tab].status === "generating",
            ),
            previewSummary: response.summary,
            currentProjectId: response.projectId ?? state.currentProjectId,
            intentDraft: response.intentDraft,
            artifacts: nextArtifacts,
            selectedNodeIds,
          };
        }),
      addMaterial: (material) =>
        set((state) => ({
          materials: [material, ...state.materials],
        })),
      updateMaterialRole: (id, role) =>
        set((state) => ({
          materials: state.materials.map((material) =>
            material.id === id ? { ...material, role } : material,
          ),
        })),
      updateMaterialKnowledgePoints: (id, points) =>
        set((state) => ({
          materials: state.materials.map((material) =>
            material.id === id
              ? { ...material, linkedKnowledgePoints: points }
              : material,
          ),
        })),
      updateMaterialNote: (id, note) =>
        set((state) => ({
          materials: state.materials.map((material) =>
            material.id === id ? { ...material, note } : material,
          ),
        })),
      removeMaterial: (id) =>
        set((state) => ({
          materials: state.materials.filter((material) => material.id !== id),
        })),
      resetWorkspace: () => set(createInitialWorkspaceState()),
    }),
    {
      name: "teaching-studio-workspace",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeArtifact: state.activeArtifact,
        selectedNodeIds: state.selectedNodeIds,
        previewSummary: state.previewSummary,
        intentDraft: state.intentDraft,
        materials: state.materials,
        artifacts: state.artifacts,
        currentProjectId: state.currentProjectId,
        latestPrompt: state.latestPrompt,
        conversation: state.conversation,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.isSyncing = false;
        state.conversation = sanitizeConversationHistory(state.conversation);
        state.latestPrompt =
          state.conversation.filter((turn) => turn.role === "user").at(-1)
            ?.text ?? state.latestPrompt;
        if (
          !state.currentProjectId &&
          !hasArtifactRenderableContent(state.artifacts.ppt)
        ) {
          state.artifacts = {
            ...state.artifacts,
            ppt: createSamplePptArtifact(),
          };
          state.activeArtifact = "ppt";
        }
      },
    },
  ),
);

export { createEmptyIntentDraft };
