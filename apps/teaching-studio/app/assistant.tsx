"use client";

import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  WebSpeechDictationAdapter,
} from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { StudioShell } from "@/components/studio/studio-shell";
import { TeachingAttachmentAdapter } from "@/lib/teaching-attachment-adapter";

export const Assistant = () => {
  const dictationAdapter = useMemo(
    () =>
      new WebSpeechDictationAdapter({
        language: "zh-CN",
        continuous: true,
        interimResults: true,
      }),
    [],
  );
  const attachmentAdapter = useMemo(() => new TeachingAttachmentAdapter(), []);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
    adapters: {
      dictation: dictationAdapter,
      attachments: attachmentAdapter,
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <StudioShell />
    </AssistantRuntimeProvider>
  );
};
