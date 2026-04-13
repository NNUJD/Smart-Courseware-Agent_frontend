export const artifactTabs = ["lesson-plan", "ppt", "video", "word"] as const;

export type ArtifactTab = (typeof artifactTabs)[number];

export const materialRoles = [
  "knowledge",
  "format",
  "style",
  "case",
  "media",
] as const;

export type MaterialRole = (typeof materialRoles)[number];

export type MaterialUploadStatus = "ready" | "uploading" | "error";

export type StudioMaterial = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  storedPath?: string;
  role: MaterialRole;
  linkedKnowledgePoints: string[];
  note: string;
  parseSummary: string;
  createdAt: string;
  status: MaterialUploadStatus;
};

export type IntentDraft = {
  teachingGoal: string;
  audience: string;
  duration: string;
  knowledgePoints: string[];
  logicSequence: string[];
  keyDifficulties: string[];
  outputStyle: string;
  finalRequirement: string;
  missingFields: string[];
  confirmed: boolean;
};

export type PreviewSection = {
  id: string;
  title: string;
  summary: string;
  body: string;
  duration?: string;
};

export type PreviewSlide = {
  id: string;
  title: string;
  caption: string;
  html: string;
};

export type ArtifactDownload = {
  fileName: string;
  contentType: string;
  localPath?: string;
};

export type VideoStoryboardScene = {
  id: string;
  title: string;
  summary: string;
  visualDirection: string;
};

export type ArtifactPreviewStatus = "idle" | "generating" | "ready" | "error";

export type ArtifactPreview = {
  tab: ArtifactTab;
  title: string;
  description: string;
  updatedAt?: string;
  downloadName: string;
  status: ArtifactPreviewStatus;
  sections: PreviewSection[];
  slides: PreviewSlide[];
  storyboard: VideoStoryboardScene[];
  previewHtml?: string;
  download?: ArtifactDownload;
};

export type StudioArtifacts = Record<ArtifactTab, ArtifactPreview>;

export type StudioConversationTurn = {
  role: "user" | "assistant";
  text: string;
};

export type StudioArtifactRequest = {
  latestPrompt: string;
  projectId?: string;
  conversation: StudioConversationTurn[];
  intentDraft: IntentDraft;
  materials: Array<
    Pick<
      StudioMaterial,
      | "id"
      | "name"
      | "mimeType"
      | "size"
      | "storedPath"
      | "role"
      | "linkedKnowledgePoints"
      | "note"
      | "parseSummary"
    >
  >;
  activeTab: ArtifactTab;
};

export type StudioArtifactResponse = {
  projectId?: string;
  intentDraft: IntentDraft;
  artifacts: StudioArtifacts;
  summary: string;
};

export type MaterialUploadResponse = {
  material: Omit<StudioMaterial, "role" | "linkedKnowledgePoints" | "note"> & {
    suggestedRole: MaterialRole;
  };
};
