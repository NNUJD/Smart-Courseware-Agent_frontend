"use client";

import { ListTodo, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TaskManagerSidebarProps = {
  open: boolean;
  onToggle(): void;
};

export const TaskManagerSidebar = ({
  open,
  onToggle,
}: TaskManagerSidebarProps) => {
  return (
    <aside
      className={cn(
        "hidden h-full min-h-0 border-border/70 border-r bg-card/70 backdrop-blur lg:flex lg:flex-col",
        open ? "w-[288px]" : "w-[56px]",
      )}
    >
      <header className="flex h-14 items-center justify-between border-border/60 border-b px-3">
        {open ? (
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-secondary p-1.5 text-secondary-foreground">
              <ListTodo className="size-4" />
            </div>
            <div>
              <p className="font-medium text-sm">任务管理</p>
              <p className="text-muted-foreground text-xs">会话与任务列表</p>
            </div>
          </div>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-full"
          onClick={onToggle}
          aria-label={open ? "收起任务管理栏" : "展开任务管理栏"}
        >
          {open ? (
            <PanelLeftClose className="size-4" />
          ) : (
            <PanelLeftOpen className="size-4" />
          )}
        </Button>
      </header>

      {open ? (
        <div className="min-h-0 flex-1 overflow-auto px-2 py-3">
          <ThreadList />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-start justify-center pt-3" />
      )}
    </aside>
  );
};
