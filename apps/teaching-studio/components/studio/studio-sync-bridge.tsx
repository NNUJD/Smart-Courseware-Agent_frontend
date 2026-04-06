"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ThreadMessage } from "@assistant-ui/core";
import { useAssistantRuntime } from "@assistant-ui/react";
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

const getMessageText = (message: ThreadMessage) =>
  normalizeText(
    message.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n"),
  );

const readConversationFromRuntime = (
  messages: readonly ThreadMessage[],
): StudioConversationTurn[] => {
  if (messages.length === 0) return [];

  return messages.flatMap((message) => {
    if (message.role !== "assistant" && message.role !== "user") return [];

    const text = getMessageText(message);
    if (!text) return [];

    return [
      {
        role: message.role,
        text,
      } satisfies StudioConversationTurn,
    ];
  });
};

const getLatestUserPrompt = (conversation: StudioConversationTurn[]) =>
  conversation.filter((message) => message.role === "user").at(-1)?.text ?? "";

const triggerAfterAssistant =
  (process.env.NEXT_PUBLIC_TEACHING_TRIGGER_AFTER_ASSISTANT ?? "false") ===
  "true";
const assistantReplyStableDelayMs = Math.max(
  0,
  Number(
    process.env.NEXT_PUBLIC_TEACHING_TRIGGER_AFTER_ASSISTANT_STABLE_DELAY_MS ??
      "1200",
  ),
);
const assistantReplyMinimumDelayAfterUserMs = Math.max(
  0,
  Number(
    process.env.NEXT_PUBLIC_TEACHING_TRIGGER_AFTER_USER_DELAY_MS ?? "1500",
  ),
);

const getLatestUserMessageIndex = (messages: readonly ThreadMessage[]) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }

  return -1;
};

const getLatestUserMessage = (messages: readonly ThreadMessage[]) => {
  const latestUserIndex = getLatestUserMessageIndex(messages);
  if (latestUserIndex === -1) return null;
  return messages[latestUserIndex] ?? null;
};

const getLatestAssistantMessageAfterLatestUser = (
  messages: readonly ThreadMessage[],
) => {
  const latestUserIndex = getLatestUserMessageIndex(messages);

  if (latestUserIndex === -1) return null;

  for (let index = messages.length - 1; index > latestUserIndex; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }

  return null;
};

const hasAssistantReplyAfterLatestUser = (
  messages: readonly ThreadMessage[],
) => {
  const latestAssistantMessage =
    getLatestAssistantMessageAfterLatestUser(messages);

  if (!latestAssistantMessage) return false;
  if (latestAssistantMessage.role !== "assistant") return false;
  if (latestAssistantMessage.status?.type === "requires-action") return false;
  if (getMessageText(latestAssistantMessage).length === 0) return false;

  return true;
};

const _isAssistantReplySettled = (
  messages: readonly ThreadMessage[],
  isThreadRunning: boolean,
) => {
  const latestAssistantMessage =
    getLatestAssistantMessageAfterLatestUser(messages);
  if (!latestAssistantMessage) return false;
  if (latestAssistantMessage.role !== "assistant") return false;
  if (latestAssistantMessage.status?.type === "requires-action") return false;
  if (getMessageText(latestAssistantMessage).length === 0) return false;
  if (isThreadRunning) return false;

  return true;
};

const buildAssistantReplyActivityKey = (messages: readonly ThreadMessage[]) => {
  const latestUserIndex = getLatestUserMessageIndex(messages);
  const latestAssistantMessage =
    getLatestAssistantMessageAfterLatestUser(messages);

  if (latestUserIndex === -1 || !latestAssistantMessage) return null;

  const latestUserMessage = messages[latestUserIndex];
  if (!latestUserMessage) return null;

  return [
    latestUserMessage.id,
    latestAssistantMessage.id,
    getMessageText(latestAssistantMessage),
  ].join("::");
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

export const StudioSyncBridge = () => {
  const assistantRuntime = useAssistantRuntime();
  const mountedRef = useRef(true);
  const pendingProjectIdRef = useRef<string | null>(null);
  const assistantReplyActivityRef = useRef<{
    key: string | null;
    at: number;
  }>({
    key: null,
    at: 0,
  });
  const latestUserTurnRef = useRef<{
    key: string | null;
    at: number;
  }>({
    key: null,
    at: 0,
  });

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
  const intentDraft = useStudioStore((state) => state.intentDraft);
  const currentProjectId = useStudioStore((state) => state.currentProjectId);
  const latestPrompt = useStudioStore((state) => state.latestPrompt);
  const persistedConversation = useStudioStore((state) => state.conversation);
  const setCurrentProjectId = useStudioStore(
    (state) => state.setCurrentProjectId,
  );
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
  const hasGeneratingArtifacts = useMemo(
    () =>
      (Object.keys(artifacts) as ArtifactTab[]).some(
        (tab) => artifacts[tab].status === "generating",
      ),
    [artifacts],
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
      const isNewPrompt = latestPrompt !== nextLatestPrompt;
      let projectIdForRequest =
        pendingProjectIdRef.current || currentProjectId || undefined;

      if (
        isNewPrompt ||
        !sameConversation(persistedConversation, inputConversation)
      ) {
        setSyncContext({
          latestPrompt: nextLatestPrompt,
          conversation: inputConversation,
        });
        if (isNewPrompt) {
          pendingProjectIdRef.current = `studio-${crypto
            .randomUUID()
            .replace(/-/g, "")
            .slice(0, 13)}`;
          projectIdForRequest = pendingProjectIdRef.current;
          setCurrentProjectId(projectIdForRequest);
        } else if (!projectIdForRequest) {
          pendingProjectIdRef.current = `studio-${crypto
            .randomUUID()
            .replace(/-/g, "")
            .slice(0, 13)}`;
          projectIdForRequest = pendingProjectIdRef.current;
          setCurrentProjectId(projectIdForRequest);
        }
      }

      const requestDigest = [
        nextLatestPrompt,
        projectIdForRequest ?? "",
        materialsDigest,
      ].join("\n---\n");
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

      const shouldEnterGeneratingState =
        !hasGeneratingArtifacts &&
        lastCompletedDigestRef.current !== requestDigest;
      if (shouldEnterGeneratingState) {
        startSync();
      }

      const requestBody: StudioArtifactRequest = {
        latestPrompt: nextLatestPrompt,
        projectId: projectIdForRequest,
        conversation: inputConversation,
        intentDraft,
        materials,
        activeTab,
      };

      fetch("/api/studio/artifacts", {
        method: "POST",
        cache: "no-store",
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
          const latestState = useStudioStore.getState();
          const isStalePrompt =
            latestState.latestPrompt.trim() !== nextLatestPrompt.trim();
          const isStaleProject =
            Boolean(projectIdForRequest) &&
            Boolean(latestState.currentProjectId) &&
            latestState.currentProjectId !== projectIdForRequest;

          inFlightDigestRef.current = null;
          if (isStalePrompt || isStaleProject) {
            return;
          }
          if (payload.projectId) {
            pendingProjectIdRef.current = payload.projectId;
            if (latestState.currentProjectId !== payload.projectId) {
              setCurrentProjectId(payload.projectId);
            }
          }

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
      const threadState = assistantRuntime.thread.getState();
      const runtimeMessages = threadState.messages;
      const runtimeConversation = readConversationFromRuntime(runtimeMessages);
      const latestUserMessage = getLatestUserMessage(runtimeMessages);
      const latestUserKey = latestUserMessage?.id ?? null;
      const nextLatestPrompt = getLatestUserPrompt(runtimeConversation);
      const conversationChanged =
        runtimeConversation.length > 0 &&
        (latestPrompt !== nextLatestPrompt ||
          !sameConversation(persistedConversation, runtimeConversation));

      if (latestUserTurnRef.current.key !== latestUserKey) {
        latestUserTurnRef.current = {
          key: latestUserKey,
          at: latestUserKey ? Date.now() : 0,
        };
      }

      if (conversationChanged && nextLatestPrompt) {
        if (latestPrompt !== nextLatestPrompt) {
          pendingProjectIdRef.current = null;
          lastCompletedDigestRef.current = null;
          inFlightDigestRef.current = null;
          lastAttemptRef.current = {
            digest: null,
            at: 0,
          };
        }

        setSyncContext({
          latestPrompt: nextLatestPrompt,
          conversation: runtimeConversation,
        });
      }

      if (runtimeConversation.length > 0) {
        const shouldPollExistingGeneration =
          hasGeneratingArtifacts &&
          Boolean(currentProjectId || pendingProjectIdRef.current);

        if (triggerAfterAssistant) {
          const hasAssistantReply =
            hasAssistantReplyAfterLatestUser(runtimeMessages);
          const replyActivityKey = hasAssistantReply
            ? buildAssistantReplyActivityKey(runtimeMessages)
            : null;

          if (assistantReplyActivityRef.current.key !== replyActivityKey) {
            assistantReplyActivityRef.current = {
              key: replyActivityKey,
              at: replyActivityKey ? Date.now() : 0,
            };
          }

          if (!hasAssistantReply && !shouldPollExistingGeneration) return;

          if (
            !shouldPollExistingGeneration &&
            Date.now() - assistantReplyActivityRef.current.at <
              assistantReplyStableDelayMs
          ) {
            return;
          }

          if (
            !shouldPollExistingGeneration &&
            Date.now() - latestUserTurnRef.current.at <
              assistantReplyMinimumDelayAfterUserMs
          ) {
            return;
          }
        }

        runSync(runtimeConversation);
        return;
      }

      if (threadState.isRunning) {
        return;
      }

      assistantReplyActivityRef.current = {
        key: null,
        at: 0,
      };

      if (persistedConversation.length > 0 && latestPrompt.trim().length > 0) {
        if (
          triggerAfterAssistant &&
          latestUserTurnRef.current.at > 0 &&
          Date.now() - latestUserTurnRef.current.at <
            assistantReplyMinimumDelayAfterUserMs
        ) {
          return;
        }

        runSync(persistedConversation);
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
        pendingProjectIdRef.current = null;
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
    applyArtifactResponse,
    hasGeneratingArtifacts,
    intentDraft,
    currentProjectId,
    assistantRuntime,
    latestPrompt,
    materials,
    materialsDigest,
    persistedConversation,
    setCurrentProjectId,
    setSyncContext,
    startSync,
    syncFailed,
  ]);

  return null;
};
