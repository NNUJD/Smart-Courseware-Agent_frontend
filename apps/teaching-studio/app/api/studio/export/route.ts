import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ArtifactPreview,
  ArtifactTab,
  IntentDraft,
  StudioArtifactRequest,
  StudioArtifacts,
  StudioConversationTurn,
} from "@/lib/studio-contract";
import {
  resolveExistingBackendArtifactResponse,
  resolveLatestCompletedBackendArtifactResponse,
} from "../_lib/courseware";

type ExportRequestBody = {
  activeArtifact?: ArtifactTab;
  projectId?: string;
  artifacts?: StudioArtifacts;
  intentDraft?: IntentDraft;
  materials?: StudioArtifactRequest["materials"];
  latestPrompt?: string;
  conversation?: StudioConversationTurn[];
};

const parseDownloadCandidate = (artifact: ArtifactPreview | undefined) =>
  artifact?.download?.localPath ? artifact.download : undefined;

const inferContentType = (targetPath: string) => {
  const lowered = targetPath.toLowerCase();
  if (lowered.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (lowered.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lowered.endsWith(".mp4")) {
    return "video/mp4";
  }
  if (lowered.endsWith(".pdf")) {
    return "application/pdf";
  }
  return "application/octet-stream";
};

const resolveExportCandidate = (
  activeArtifact: ArtifactTab | undefined,
  artifacts: StudioArtifacts | undefined,
) => {
  if (!artifacts) return undefined;

  const preferredTabs: ArtifactTab[] = [
    activeArtifact ?? "ppt",
    "ppt",
    "word",
    "lesson-plan",
    "video",
  ];

  for (const tab of preferredTabs) {
    const candidate = parseDownloadCandidate(artifacts[tab]);
    if (candidate) return candidate;
  }

  return undefined;
};

const createFallbackConversation = (
  latestPrompt: string,
  conversation: StudioConversationTurn[] | undefined,
) => {
  if (conversation && conversation.length > 0) return conversation;
  return latestPrompt.trim().length > 0
    ? ([
        { role: "user", text: latestPrompt },
      ] satisfies StudioConversationTurn[])
    : [];
};

const tryRecoverArtifacts = async (payload: ExportRequestBody) => {
  if (!payload.intentDraft) return undefined;
  const latestPrompt = payload.latestPrompt ?? "";

  const request: StudioArtifactRequest = {
    latestPrompt,
    projectId: payload.projectId,
    conversation: createFallbackConversation(
      latestPrompt,
      payload.conversation,
    ),
    intentDraft: payload.intentDraft,
    materials: payload.materials ?? [],
    activeTab: payload.activeArtifact ?? "ppt",
  };

  const response = await resolveExistingBackendArtifactResponse({
    request,
    intentDraft: payload.intentDraft,
    assistantDraft: "",
  });

  if (response?.artifacts) return response.artifacts;

  const latestCompletedResponse =
    await resolveLatestCompletedBackendArtifactResponse({
      request,
      intentDraft: payload.intentDraft,
      assistantDraft: "",
    });

  return latestCompletedResponse?.artifacts;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as ExportRequestBody;
  let candidate = resolveExportCandidate(
    payload.activeArtifact,
    payload.artifacts,
  );

  if (!candidate) {
    const recoveredArtifacts = await tryRecoverArtifacts(payload);
    candidate = resolveExportCandidate(
      payload.activeArtifact,
      recoveredArtifacts,
    );
  }

  if (candidate?.localPath) {
    try {
      const fileBuffer = await readFile(candidate.localPath);
      const fileName =
        candidate.fileName?.trim() || path.basename(candidate.localPath);
      const contentType =
        candidate.contentType?.trim() || inferContentType(candidate.localPath);

      return new Response(fileBuffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    } catch {
      return Response.json(
        {
          error: "artifact_not_found",
          detail: "当前生成文件不存在，请重新触发一次课件生成。",
        },
        { status: 404 },
      );
    }
  }

  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      format: "workspace-snapshot",
      projectId: payload.projectId ?? null,
      activeArtifact: payload.activeArtifact ?? null,
      data: payload,
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="teaching-studio-workspace.json"',
    },
  });
}
