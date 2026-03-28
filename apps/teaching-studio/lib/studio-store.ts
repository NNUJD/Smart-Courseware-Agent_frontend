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

const mergeConversationHistory = (
  previous: StudioConversationTurn[],
  incoming: StudioConversationTurn[],
) => {
  if (previous.length === 0) return incoming;
  if (incoming.length === 0) return previous;
  if (sameConversation(previous, incoming)) return incoming;

  let overlap = 0;

  const maxOverlap = Math.min(previous.length, incoming.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    const previousSuffix = previous.slice(previous.length - size);
    const incomingPrefix = incoming.slice(0, size);
    if (sameConversation(previousSuffix, incomingPrefix)) {
      overlap = size;
      break;
    }
  }

  if (overlap > 0) {
    return [...previous, ...incoming.slice(overlap)];
  }

  const previousPrompt = previous.at(-1)?.text ?? "";
  const incomingPrompt = incoming.at(-1)?.text ?? "";
  if (
    previous.length >= incoming.length &&
    incoming.every(
      (item, index) =>
        item.role === previous[index]?.role && item.text === previous[index]?.text,
    )
  ) {
    return previous;
  }

  if (previousPrompt && incomingPrompt && previousPrompt === incomingPrompt) {
    return previous;
  }

  return incoming;
};

const createInitialWorkspaceState = () => ({
  activeArtifact: "lesson-plan" as ArtifactTab,
  selectedNodeIds: {} as Partial<Record<ArtifactTab, string>>,
  isSyncing: false,
  previewSummary: defaultPreviewSummary,
  intentDraft: createEmptyIntentDraft(),
  materials: [] as StudioMaterial[],
  artifacts: createIdleArtifacts(),
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
          const mergedConversation = mergeConversationHistory(
            state.conversation,
            conversation,
          );
          const samePrompt = state.latestPrompt === latestPrompt;
          const sameThread = sameConversation(
            state.conversation,
            mergedConversation,
          );

          if (samePrompt) {
            if (sameThread) {
              return {
                latestPrompt,
                conversation: mergedConversation,
              };
            }

            return {
              latestPrompt,
              conversation: mergedConversation,
            };
          }

          return {
            latestPrompt,
            conversation: mergedConversation,
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

          for (const tab of Object.keys(response.artifacts) as ArtifactTab[]) {
            const artifact = response.artifacts[tab];
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
            isSyncing: false,
            previewSummary: response.summary,
            currentProjectId: response.projectId ?? state.currentProjectId,
            intentDraft: response.intentDraft,
            artifacts: response.artifacts,
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
      },
    },
  ),
);

export { createEmptyIntentDraft };
