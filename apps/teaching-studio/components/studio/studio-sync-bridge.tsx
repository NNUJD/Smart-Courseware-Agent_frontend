"use client";

import { useEffect, useMemo, useRef } from "react";
import type {
  ArtifactTab,
  StudioArtifactRequest,
  StudioArtifactResponse,
  StudioConversationTurn,
} from "@/lib/studio-contract";
import { useStudioStore } from "@/lib/studio-store";

const normalizeText = (input: string) =>
  input
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

const readConversationFromDom = (): StudioConversationTurn[] => {
  if (typeof document === "undefined") return [];

  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>("[data-teaching-role]"),
  );

  return nodes
    .map((node) => {
      const role: StudioConversationTurn["role"] =
        node.dataset.teachingRole === "assistant" ? "assistant" : "user";
      return {
        role,
        text: normalizeText(node.innerText || node.textContent || ""),
      };
    })
    .filter((item) => item.text.length > 0);
};

const getLatestUserPrompt = (conversation: StudioConversationTurn[]) =>
  conversation.filter((message) => message.role === "user").at(-1)?.text ?? "";

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

export const StudioSyncBridge = () => {
  const mountedRef = useRef(true);

  const studioMaterials = useStudioStore((state) => state.materials);
  const materials = studioMaterials.map((material) => ({
    id: material.id,
    name: material.name,
    mimeType: material.mimeType,
    size: material.size,
    role: material.role,
    linkedKnowledgePoints: material.linkedKnowledgePoints,
    note: material.note,
    parseSummary: material.parseSummary,
  }));

  const activeTab = useStudioStore((state) => state.activeArtifact);
  const artifacts = useStudioStore((state) => state.artifacts);
  const isSyncing = useStudioStore((state) => state.isSyncing);
  const intentDraft = useStudioStore((state) => state.intentDraft);
  const currentProjectId = useStudioStore((state) => state.currentProjectId);
  const latestPrompt = useStudioStore((state) => state.latestPrompt);
  const persistedConversation = useStudioStore((state) => state.conversation);
  const setSyncContext = useStudioStore((state) => state.setSyncContext);
  const startSync = useStudioStore((state) => state.startSync);
  const syncFailed = useStudioStore((state) => state.syncFailed);
  const applyArtifactResponse = useStudioStore(
    (state) => state.applyArtifactResponse,
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

  const lastCompletedDigestRef = useRef<string | null>(null);
  const inFlightDigestRef = useRef<string | null>(null);
  const lastAttemptRef = useRef<{ digest: string | null; at: number }>({
    digest: null,
    at: 0,
  });

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const runSync = (inputConversation: StudioConversationTurn[]) => {
      const nextLatestPrompt = getLatestUserPrompt(inputConversation);
      if (!nextLatestPrompt) return;

      if (
        latestPrompt !== nextLatestPrompt ||
        !sameConversation(persistedConversation, inputConversation)
      ) {
        setSyncContext({
          latestPrompt: nextLatestPrompt,
          conversation: inputConversation,
        });
      }

      const requestDigest = [nextLatestPrompt, materialsDigest].join("\n---\n");
      if (lastCompletedDigestRef.current === requestDigest) return;
      if (inFlightDigestRef.current === requestDigest) return;

      const now = Date.now();
      if (
        lastAttemptRef.current.digest === requestDigest &&
        now - lastAttemptRef.current.at < 4000
      ) {
        return;
      }

      lastAttemptRef.current = {
        digest: requestDigest,
        at: now,
      };
      inFlightDigestRef.current = requestDigest;

      const hasPendingArtifacts = (
        Object.keys(artifacts) as ArtifactTab[]
      ).some((tab) => artifacts[tab].status === "generating");

      if (!isSyncing && !hasPendingArtifacts) {
        startSync();
      }

      const requestBody: StudioArtifactRequest = {
        latestPrompt: nextLatestPrompt,
        projectId: currentProjectId || undefined,
        conversation: inputConversation,
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
          if (!mountedRef.current) return;
          inFlightDigestRef.current = null;

          const allReady = (
            Object.values(
              payload.artifacts,
            ) as StudioArtifactResponse["artifacts"][ArtifactTab][]
          ).every((artifact) => artifact.status === "ready");

          if (allReady) {
            lastCompletedDigestRef.current = requestDigest;
          } else if (lastCompletedDigestRef.current === requestDigest) {
            lastCompletedDigestRef.current = null;
          }

          applyArtifactResponse(payload);
        })
        .catch(() => {
          if (!mountedRef.current) return;
          inFlightDigestRef.current = null;
          syncFailed(
            "预览服务暂时不可用，后端接入后可在此返回结构化课件结果。",
          );
        });
    };

    const tick = () => {
      const domConversation = readConversationFromDom();
      const hasGeneratingArtifacts = (
        Object.keys(artifacts) as ArtifactTab[]
      ).some((tab) => artifacts[tab].status === "generating");

      if (domConversation.length > 0) {
        runSync(domConversation);
        return;
      }

      if (hasGeneratingArtifacts && latestPrompt.trim().length > 0) {
        const fallbackConversation =
          persistedConversation.length > 0
            ? persistedConversation
            : [
                {
                  role: "user",
                  text: latestPrompt,
                } satisfies StudioConversationTurn,
              ];
        runSync(fallbackConversation);
        return;
      }

      if (!latestPrompt.trim()) {
        lastCompletedDigestRef.current = null;
        inFlightDigestRef.current = null;
        lastAttemptRef.current = {
          digest: null,
          at: 0,
        };
      }
    };

    tick();
    const timer = window.setInterval(tick, 1200);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    activeTab,
    artifacts,
    applyArtifactResponse,
    intentDraft,
    isSyncing,
    currentProjectId,
    latestPrompt,
    materials,
    materialsDigest,
    persistedConversation,
    setSyncContext,
    startSync,
    syncFailed,
  ]);

  return null;
};
