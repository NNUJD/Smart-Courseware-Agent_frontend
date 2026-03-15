"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationPanel } from "./conversation-panel";
import { PreviewWorkbench } from "./preview-workbench";
import { TaskManagerSidebar } from "./task-manager-sidebar";

const DEFAULT_LEFT_WIDTH_PERCENT = 42;
const MIN_LEFT_WIDTH = 360;
const MIN_RIGHT_WIDTH = 520;

export const StudioShell = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isTaskSidebarOpen, setIsTaskSidebarOpen] = useState(true);
  const [isPreviewRegionOpen, setIsPreviewRegionOpen] = useState(true);
  const [leftWidthPercent, setLeftWidthPercent] = useState(
    DEFAULT_LEFT_WIDTH_PERCENT,
  );

  const clampLeftWidth = useCallback((leftPx: number, totalWidth: number) => {
    const maxLeftWidth = Math.max(MIN_LEFT_WIDTH, totalWidth - MIN_RIGHT_WIDTH);
    const boundedLeftWidth = Math.min(
      Math.max(leftPx, MIN_LEFT_WIDTH),
      maxLeftWidth,
    );
    return (boundedLeftWidth / totalWidth) * 100;
  }, []);

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;

      event.preventDefault();

      const rect = container.getBoundingClientRect();
      const onPointerMove = (moveEvent: PointerEvent) => {
        const leftPx = moveEvent.clientX - rect.left;
        setLeftWidthPercent(clampLeftWidth(leftPx, rect.width));
      };
      const stopResize = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", stopResize);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", stopResize);
    },
    [clampLeftWidth],
  );

  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const currentLeftWidth = (leftWidthPercent / 100) * rect.width;
      const nextPercent = clampLeftWidth(currentLeftWidth, rect.width);
      if (Math.abs(nextPercent - leftWidthPercent) > 0.1) {
        setLeftWidthPercent(nextPercent);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [leftWidthPercent, clampLeftWidth]);

  return (
    <div className="h-dvh w-full overflow-hidden bg-transparent">
      <div className="flex h-full min-h-0">
        <TaskManagerSidebar
          open={isTaskSidebarOpen}
          onToggle={() => setIsTaskSidebarOpen((value) => !value)}
        />

        <div
          ref={containerRef}
          className="flex h-full min-h-0 flex-1 flex-col lg:flex-row"
        >
          <div
            className="min-h-0 w-full lg:h-full lg:min-w-[360px]"
            style={{
              width: isPreviewRegionOpen ? `${leftWidthPercent}%` : "100%",
            }}
          >
            <ConversationPanel />
          </div>

          {isPreviewRegionOpen ? (
            <>
              <div
                aria-hidden
                onPointerDown={startResize}
                className="group relative hidden w-3 cursor-col-resize bg-transparent lg:block"
              >
                <div className="mx-auto h-full w-px bg-border/80 transition-colors group-hover:bg-primary/70" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="absolute top-3 left-1/2 size-7 -translate-x-1/2 rounded-full"
                  aria-label="收起右侧预览区"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setIsPreviewRegionOpen(false)}
                >
                  <PanelRightClose className="size-4" />
                </Button>
              </div>

              <div className="min-h-0 w-full flex-1 lg:min-w-[520px]">
                <PreviewWorkbench />
              </div>
            </>
          ) : (
            <div className="hidden w-10 flex-col items-center border-border/60 border-l bg-card/55 py-3 lg:flex">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8 rounded-full"
                aria-label="展开右侧预览区"
                onClick={() => setIsPreviewRegionOpen(true)}
              >
                <PanelRightOpen className="size-4" />
              </Button>
            </div>
          )}
          <div className="min-h-0 w-full lg:hidden">
            <PreviewWorkbench />
          </div>
        </div>
      </div>
    </div>
  );
};
