"use client";

import { Thread } from "@/components/assistant-ui/thread";
import { StudioSyncBridge } from "./studio-sync-bridge";

export const ConversationPanel = () => {
  return (
    <section className="flex h-full min-h-0 flex-col px-4 py-3 lg:px-5">
      <div className="min-h-0 flex-1 overflow-hidden rounded-[32px] border border-border/70 bg-card/75 shadow-sm backdrop-blur-sm">
        <StudioSyncBridge />
        <Thread />
      </div>
    </section>
  );
};
