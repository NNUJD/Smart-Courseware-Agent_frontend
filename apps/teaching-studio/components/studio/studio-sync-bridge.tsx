"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAuiState } from "@assistant-ui/react";
import type {
  StudioArtifactRequest,
  StudioArtifactResponse,
  StudioConversationTurn,
} from "@/lib/studio-contract";
import { useStudioStore } from "@/lib/studio-store";

type RuntimeMessage = {
  role: "user" | "assistant";
  content: Array<{
    type: string;
    text?: string;
  }>;
};

const flattenMessageText = (message: RuntimeMessage) =>
  message.content
    .map((part) => {
      if (part.type === "text" || part.type === "reasoning") {
        return part.text ?? "";
      }

      return "";
    })
    .join("\n")
    .trim();

export const StudioSyncBridge = () => {
  const threadMessages = useAuiState((state: any) => state.thread.messages);
  const messages = useMemo<RuntimeMessage[]>(
    () =>
      threadMessages.map((message: any) => ({
        role: message.role,
        content: message.content,
      })),
    [threadMessages],
  );
  const studioMaterials = useStudioStore((state) => state.materials);
  const materials = useMemo(
    () =>
      studioMaterials.map((material) => ({
        id: material.id,
        name: material.name,
        mimeType: material.mimeType,
        size: material.size,
        role: material.role,
        linkedKnowledgePoints: material.linkedKnowledgePoints,
        note: material.note,
        parseSummary: material.parseSummary,
      })),
    [studioMaterials],
  );
  const activeTab = useStudioStore((state) => state.activeArtifact);
  const intentDraft = useStudioStore((state) => state.intentDraft);
  const startSync = useStudioStore((state) => state.startSync);
  const syncFailed = useStudioStore((state) => state.syncFailed);
  const applyArtifactResponse = useStudioStore(
    (state) => state.applyArtifactResponse,
  );

  const conversation = useMemo<StudioConversationTurn[]>(() => {
    return messages
      .map((message) => ({
        role: message.role,
        text: flattenMessageText(message),
      }))
      .filter((message) => message.text.length > 0);
  }, [messages]);

  const latestPrompt = conversation
    .filter((message) => message.role === "user")
    .at(-1)?.text;

  const conversationDigest = useMemo(
    () =>
      conversation
        .map((message) => `${message.role}:${message.text}`)
        .join("\n---\n"),
    [conversation],
  );

  const materialsDigest = useMemo(
    () =>
      materials
        .map((material) =>
          [
            material.id,
            material.role,
            material.linkedKnowledgePoints.join("|"),
            material.note,
            material.parseSummary,
          ].join("::"),
        )
        .join("\n"),
    [materials],
  );

  const previousDigestRef = useRef<string | null>(null);

  useEffect(() => {
    if (!latestPrompt) return;

    const requestDigest = `${latestPrompt}\n${conversationDigest}\n${materialsDigest}`;
    if (previousDigestRef.current === requestDigest) return;

    previousDigestRef.current = requestDigest;

    let cancelled = false;
    startSync();

    const requestBody: StudioArtifactRequest = {
      latestPrompt,
      conversation,
      intentDraft,
      materials,
      activeTab,
    };

    fetch("/api/studio/artifacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("preview_generation_failed");
        }

        return (await response.json()) as StudioArtifactResponse;
      })
      .then((payload) => {
        if (cancelled) return;
        applyArtifactResponse(payload);
      })
      .catch(() => {
        if (cancelled) return;
        syncFailed("预览服务暂时不可用，后端接入后可在此返回结构化课件结果。");
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    applyArtifactResponse,
    conversation,
    conversationDigest,
    intentDraft,
    latestPrompt,
    materials,
    materialsDigest,
    startSync,
    syncFailed,
  ]);

  return null;
};
