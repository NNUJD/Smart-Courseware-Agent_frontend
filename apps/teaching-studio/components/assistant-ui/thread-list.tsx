import { useState, type FC } from "react";
import {
  ArchiveIcon,
  LoaderCircle,
  MoreHorizontalIcon,
  PlusIcon,
} from "lucide-react";
import { useThreadList, useThreadRuntime } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudioStore } from "@/lib/studio-store";
import {
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
} from "@assistant-ui/react";

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
  const threadRuntime = useThreadRuntime();
  const resetWorkspace = useStudioStore((state) => state.resetWorkspace);
  const [isResetting, setIsResetting] = useState(false);

  const handleNewTask = async () => {
    setIsResetting(true);

    try {
      if (threadRuntime.getState().isRunning) {
        threadRuntime.cancelRun();
      }

      threadRuntime.reset();
      await threadRuntime.composer.reset();
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
  return (
    <ThreadListItemPrimitive.Root className="group flex h-10 items-center gap-2 rounded-2xl transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none data-active:bg-muted">
      <ThreadListItemPrimitive.Trigger className="flex h-full min-w-0 flex-1 items-center truncate px-3 text-start text-sm">
        <ThreadListItemPrimitive.Title fallback="未命名任务" />
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemMore />
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemMore: FC = () => {
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
