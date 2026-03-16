"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAuiState } from "@assistant-ui/react";
import type {
  StudioArtifactRequest,
  StudioArtifactResponse,
  StudioConversationTurn,
} from "@/lib/studio-contract";
import { useStudioStore } from "@/lib/studio-store";

const extractTextDeep = (
  value: unknown,
  seen = new WeakSet<object>(),
): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (!value || typeof value !== "object") return "";

  if (seen.has(value)) return "";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => extractTextDeep(item, seen)).join("\n");
  }

  const record = value as Record<string, unknown>;
  const directText =
    (typeof record.text === "string" ? record.text : "") ||
    (typeof record.content === "string" ? record.content : "");

  const nestedText = [
    extractTextDeep(record.parts, seen),
    extractTextDeep(record.content, seen),
    extractTextDeep(record.delta, seen),
    extractTextDeep(record.value, seen),
  ]
    .filter(Boolean)
    .join("\n");

  return [directText, nestedText].filter(Boolean).join("\n");
};

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

const conversationScore = (conversation: StudioConversationTurn[]) => {
  return conversation.reduce((sum, turn) => {
    if (turn.role !== "assistant") return sum;
    return sum + turn.text.length;
  }, 0);
};

const pickBetterConversation = (
  stateConversation: StudioConversationTurn[],
  domConversation: StudioConversationTurn[],
) => {
  if (domConversation.length === 0) return stateConversation;
  if (stateConversation.length === 0) return domConversation;

  if (
    conversationScore(domConversation) > conversationScore(stateConversation)
  ) {
    return domConversation;
  }

  return stateConversation;
};

export const StudioSyncBridge = () => {
  const threadMessages = useAuiState(
    (state: any) => state.thread.messages as Array<Record<string, unknown>>,
  );

  const conversation = useMemo<StudioConversationTurn[]>(
    () =>
      (threadMessages ?? [])
        .map((message) => ({
          role: (String(message.role) === "assistant"
            ? "assistant"
            : "user") as StudioConversationTurn["role"],
          text: normalizeText(
            extractTextDeep({
              content: message.content,
              parts: message.parts,
              text: message.text,
            }),
          ),
        }))
        .filter((message) => message.text.length > 0),
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
    let cancelled = false;

    const runSync = (inputConversation: StudioConversationTurn[]) => {
      const nextLatestPrompt = inputConversation
        .filter((message) => message.role === "user")
        .at(-1)?.text;
      if (!nextLatestPrompt) return;

      const nextConversationDigest = inputConversation
        .map((message) => `${message.role}:${message.text}`)
        .join("\n---\n");
      const requestDigest = `${nextLatestPrompt}\n${nextConversationDigest}\n${materialsDigest}`;
      if (previousDigestRef.current === requestDigest) return;
      previousDigestRef.current = requestDigest;

      startSync();

      const requestBody: StudioArtifactRequest = {
        latestPrompt: nextLatestPrompt,
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
          if (cancelled) return;
          applyArtifactResponse(payload);
        })
        .catch(() => {
          if (cancelled) return;
          syncFailed(
            "\u9884\u89c8\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u540e\u7aef\u63a5\u5165\u540e\u53ef\u5728\u6b64\u8fd4\u56de\u7ed3\u6784\u5316\u8bfe\u4ef6\u7ed3\u679c\u3002",
          );
        });
    };

    const tick = () => {
      const domConversation = readConversationFromDom();
      const betterConversation = pickBetterConversation(
        conversation,
        domConversation,
      );
      runSync(betterConversation);
    };

    tick();
    const timer = window.setInterval(tick, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    activeTab,
    applyArtifactResponse,
    conversation,
    intentDraft,
    materials,
    materialsDigest,
    startSync,
    syncFailed,
  ]);

  return null;
};
