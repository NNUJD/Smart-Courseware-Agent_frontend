"use client";

import { Thread } from "@/components/assistant-ui/thread";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { IntentSummaryCard } from "./intent-summary-card";
import { MaterialBindingPanel } from "./material-binding-panel";
import { StudioSyncBridge } from "./studio-sync-bridge";

export const ConversationPanel = () => {
  return (
    <section className="flex min-h-0 flex-col px-4 pt-3 pb-4 lg:px-5">
      <div className="mb-4 flex items-center justify-between rounded-3xl border border-border/70 bg-card/75 px-4 py-3 backdrop-blur-sm">
        <div>
          <p className="font-medium text-primary text-sm">教学需求对话区</p>
          <h1 className="font-semibold text-xl">
            先对话澄清，再补充资料与意图摘要
          </h1>
        </div>
        <SidebarTrigger className="shrink-0 xl:hidden" />
      </div>

      <div className="min-h-[460px] flex-1 overflow-hidden rounded-[32px] border border-border/70 bg-card/75 shadow-sm backdrop-blur-sm">
        <StudioSyncBridge />
        <Thread />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <IntentSummaryCard />
        <MaterialBindingPanel />
      </div>
    </section>
  );
};
