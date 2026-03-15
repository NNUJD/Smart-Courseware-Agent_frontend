"use client";

import { useEffect, useRef, useState, type FC } from "react";
import {
  ArchiveIcon,
  CheckIcon,
  LoaderCircle,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import {
  useAssistantRuntime,
  useAuiState,
  useThreadList,
  useThreadRuntime,
} from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/lib/studio-store";
import {
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
} from "@assistant-ui/react";

const UNTITLED_TASK = "未命名任务";

export const ThreadList: FC = () => {
  const isLoading = useThreadList((state) => state.isLoading);

  return (
    <ThreadListPrimitive.Root className="flex flex-col gap-2">
      <ThreadListNew />
      {isLoading ? <ThreadListSkeleton /> : null}
      {!isLoading ? (
        <ThreadListPrimitive.Items components={{ ThreadListItem }} />
      ) : null}
    </ThreadListPrimitive.Root>
  );
};

const ThreadListNew: FC = () => {
  const assistantRuntime = useAssistantRuntime();
  const threadRuntime = useThreadRuntime();
  const resetWorkspace = useStudioStore((state) => state.resetWorkspace);
  const [isResetting, setIsResetting] = useState(false);

  const handleNewTask = async () => {
    setIsResetting(true);

    try {
      if (threadRuntime.getState().isRunning) {
        threadRuntime.cancelRun();
      }

      await assistantRuntime.switchToNewThread();
      resetWorkspace();
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 justify-start gap-2 rounded-2xl border-border/70 bg-background/80 px-3 text-sm hover:bg-muted"
      disabled={isResetting}
      onClick={() => void handleNewTask()}
    >
      {isResetting ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <PlusIcon className="size-4" />
      )}
      新建任务
    </Button>
  );
};

const ThreadListSkeleton: FC = () => {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          role="status"
          aria-label="Loading threads"
          className="flex h-10 items-center px-3"
        >
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
};

const ThreadListItem: FC = () => {
  const assistantRuntime = useAssistantRuntime();
  const threadId = useAuiState((state: any) => state.threadListItem.id);
  const title = useAuiState((state: any) => state.threadListItem.title);

  const [isRenaming, setIsRenaming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isRenaming) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isRenaming]);

  const handleStartRename = () => {
    setDraftTitle(typeof title === "string" && title.trim() ? title : "");
    setIsRenaming(true);
  };

  const handleCancelRename = () => {
    setDraftTitle("");
    setIsRenaming(false);
  };

  const handleCommitRename = async () => {
    if (isSaving) return;

    const nextTitle = draftTitle.trim();
    const currentTitle = (title ?? "").trim();

    if (!nextTitle || nextTitle === currentTitle) {
      handleCancelRename();
      return;
    }

    setIsSaving(true);
    try {
      const runtime = assistantRuntime as any;
      if (runtime?.threads?.rename) {
        await runtime.threads.rename(threadId, nextTitle);
      } else if (runtime?.rename) {
        await runtime.rename(threadId, nextTitle);
      }
    } catch (error) {
      console.error("Rename thread failed:", error);
    } finally {
      setIsSaving(false);
      setIsRenaming(false);
    }
  };

  return (
    <ThreadListItemPrimitive.Root className="group flex h-10 items-center gap-2 rounded-2xl transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none data-active:bg-muted">
      {isRenaming ? (
        <div className="flex h-full min-w-0 flex-1 items-center gap-1 pl-3">
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={() => void handleCommitRename()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleCommitRename();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                handleCancelRename();
              }
            }}
            className="h-7 min-w-0 flex-1 rounded-md border border-border/70 bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder={UNTITLED_TASK}
            aria-label="任务名称"
            disabled={isSaving}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void handleCommitRename()}
            disabled={isSaving}
            aria-label="保存任务名称"
          >
            <CheckIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mr-1 size-7"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleCancelRename}
            disabled={isSaving}
            aria-label="取消重命名"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      ) : (
        <>
          <ThreadListItemPrimitive.Trigger className="flex h-full min-w-0 flex-1 items-center truncate px-3 text-start text-sm">
            <ThreadListItemPrimitive.Title fallback={UNTITLED_TASK} />
          </ThreadListItemPrimitive.Trigger>
          <ThreadListItemMore onRename={handleStartRename} />
        </>
      )}
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemMore: FC<{ onRename(): void }> = ({ onRename }) => {
  return (
    <ThreadListItemMorePrimitive.Root>
      <ThreadListItemMorePrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="mr-2 size-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100 group-data-active:opacity-100"
        >
          <MoreHorizontalIcon className="size-4" />
          <span className="sr-only">More options</span>
        </Button>
      </ThreadListItemMorePrimitive.Trigger>
      <ThreadListItemMorePrimitive.Content
        side="bottom"
        align="start"
        className="z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <ThreadListItemMorePrimitive.Item
          onSelect={onRename}
          className={cn(
            "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
            "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
          )}
        >
          <PencilIcon className="size-4" />
          重命名
        </ThreadListItemMorePrimitive.Item>

        <ThreadListItemPrimitive.Archive asChild>
          <ThreadListItemMorePrimitive.Item className="flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
            <ArchiveIcon className="size-4" />
            归档
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemPrimitive.Archive>
      </ThreadListItemMorePrimitive.Content>
    </ThreadListItemMorePrimitive.Root>
  );
};
