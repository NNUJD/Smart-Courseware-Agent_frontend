"use client";

import { ThreadListSidebar } from "@/components/assistant-ui/threadlist-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ConversationPanel } from "./conversation-panel";
import { PreviewWorkbench } from "./preview-workbench";

export const StudioShell = () => {
  return (
    <SidebarProvider defaultOpen>
      <div className="flex h-dvh w-full overflow-hidden">
        <ThreadListSidebar />
        <SidebarInset className="min-h-0 bg-transparent">
          <div className="grid h-full min-h-0 xl:grid-cols-[minmax(420px,0.82fr)_minmax(760px,1.18fr)] 2xl:grid-cols-[minmax(460px,0.78fr)_minmax(900px,1.22fr)]">
            <ConversationPanel />
            <PreviewWorkbench />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};
