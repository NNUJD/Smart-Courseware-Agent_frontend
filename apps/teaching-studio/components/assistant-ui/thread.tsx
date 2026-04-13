"use client";

import { useCallback, useState, type FC } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  GripHorizontalIcon,
  MicIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
  StopCircleIcon,
  WandSparklesIcon,
} from "lucide-react";
import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { Reasoning } from "@/components/assistant-ui/reasoning";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { useStudioStore } from "@/lib/studio-store";
import { cn } from "@/lib/utils";
import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";

const MIN_CONTEXT_GAP = 4;
const MAX_CONTEXT_GAP = 220;
const DEFAULT_CONTEXT_GAP = 40;

export const Thread: FC = () => {
  const [contextGap, setContextGap] = useState(DEFAULT_CONTEXT_GAP);

  const handleResizeContextGap = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();

      const startY = event.clientY;
      const startGap = contextGap;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const nextGap = Math.min(
          MAX_CONTEXT_GAP,
          Math.max(MIN_CONTEXT_GAP, startGap + moveEvent.clientY - startY),
        );
        setContextGap(nextGap);
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [contextGap],
  );

  return (
    <ThreadPrimitive.Root
      className="flex h-full min-h-0 flex-col bg-transparent"
      style={{ ["--thread-max-width" as string]: "100%" }}
    >
      <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4">
        <ThreadPrimitive.If empty>
          <ThreadWelcome />
        </ThreadPrimitive.If>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
            EditComposer,
          }}
        />
      </ThreadPrimitive.Viewport>

      <div
        className="mx-auto flex w-full max-w-(--thread-max-width) flex-none flex-col gap-2 bg-linear-to-b from-transparent via-background/96 to-background px-4 pb-4"
        style={{ paddingTop: contextGap }}
      >
        <div className="flex items-center justify-center py-1">
          <button
            type="button"
            onPointerDown={handleResizeContextGap}
            className="inline-flex h-5 w-14 cursor-row-resize items-center justify-center rounded-full border border-border/70 bg-background/85 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="调整消息区与输入区间距"
          >
            <GripHorizontalIcon className="size-3.5" />
          </button>
        </div>
        <ThreadScrollToBottom />
        <Composer />
      </div>
    </ThreadPrimitive.Root>
  );
};

const ThreadWelcome: FC = () => {
  const persistedConversation = useStudioStore((state) => state.conversation);

  if (persistedConversation.length > 0) {
    return (
      <div className="mx-auto flex h-full w-full max-w-(--thread-max-width) flex-1 flex-col px-2 pt-2 pb-4">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-primary text-xs">
          已恢复上次会话内容
        </div>
        <div className="mt-4 flex flex-1 flex-col gap-3 pr-1">
          {persistedConversation.map((message, index) => {
            const isAssistant = message.role === "assistant";
            return (
              <div
                key={`persisted-message-${index + 1}`}
                className={cn(
                  "flex w-full",
                  isAssistant ? "justify-start" : "justify-end",
                )}
              >
                <div
                  className={cn(
                    "max-w-[88%] whitespace-pre-wrap rounded-[24px] px-4 py-3 text-sm leading-7 shadow-sm",
                    isAssistant
                      ? "border border-border/60 bg-background/85 text-foreground"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {message.text}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-(--thread-max-width) flex-1 flex-col justify-between px-2 pt-2 pb-2">
      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/60 bg-amber-50 px-3 py-1 text-amber-900 text-xs">
        <WandSparklesIcon className="size-3.5" />
        先澄清需求，再生成内容
      </div>
      <h1 className="mt-5 font-semibold text-3xl text-foreground">
        这节课要生成什么成果？
      </h1>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground leading-7">
        直接输入教学目标、知识点、课时、班级学情和产出风格，或先上传教材、PDF、PPT、图片、视频作为参考。系统会主动追问缺失信息，并在右侧实时预览教案、PPT、视频和
        Word 结果。
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <WelcomeCard
          title="新授课生成"
          description="先问清教学目标、重点难点和时长，再生成完整课件。"
        />
        <WelcomeCard
          title="基于资料重构"
          description="上传教材、现有 PPT 或教学设计，提取可用知识点和版式。"
        />
        <WelcomeCard
          title="局部修改再生成"
          description="围绕某页、某段或某个案例提出修改意见，局部调整输出。"
        />
      </div>
    </div>
  );
};

const WelcomeCard: FC<{ title: string; description: string }> = ({
  title,
  description,
}) => {
  return (
    <div className="rounded-3xl border border-border/70 bg-background/85 p-4 shadow-sm">
      <div className="font-medium text-foreground text-sm">{title}</div>
      <div className="mt-2 text-muted-foreground text-sm leading-6">
        {description}
      </div>
    </div>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="回到底部"
        variant="outline"
        className="absolute -top-12 self-center rounded-full border-border/70 bg-background/90 p-4 backdrop-blur disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col">
      <ComposerPrimitive.AttachmentDropzone className="flex w-full flex-col rounded-[28px] border border-border/80 bg-background/96 px-2 pt-2 shadow-lg shadow-primary/5 backdrop-blur">
        <ComposerAttachments />

        <ComposerPrimitive.If dictation>
          <div className="mx-2 mb-2 rounded-2xl bg-secondary/90 px-4 py-3 text-muted-foreground text-sm">
            <span className="mr-2 inline-flex size-2 rounded-full bg-rose-400" />
            <ComposerPrimitive.DictationTranscript />
          </div>
        </ComposerPrimitive.If>

        <ComposerPrimitive.Input
          placeholder="输入教学目标、知识点、课时、产出风格，或直接说“先帮我澄清需求”。"
          className="min-h-16 w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm outline-none placeholder:text-muted-foreground"
          rows={1}
          autoFocus
          aria-label="教学需求输入框"
        />

        <div className="mx-2 mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-secondary/80 px-2 py-1">
              <ComposerAddAttachment />
            </div>

            <ComposerPrimitive.If dictation={false}>
              <ComposerPrimitive.Dictate asChild>
                <TooltipIconButton
                  tooltip="语音输入"
                  side="bottom"
                  variant="ghost"
                  size="icon"
                  className="size-9 rounded-full border border-border/70 bg-background"
                  aria-label="开始语音输入"
                >
                  <MicIcon className="size-4" />
                </TooltipIconButton>
              </ComposerPrimitive.Dictate>
            </ComposerPrimitive.If>

            <ComposerPrimitive.If dictation>
              <ComposerPrimitive.StopDictation asChild>
                <TooltipIconButton
                  tooltip="停止语音输入"
                  side="bottom"
                  variant="ghost"
                  size="icon"
                  className="size-9 rounded-full border border-border/70 bg-background text-rose-500"
                  aria-label="停止语音输入"
                >
                  <StopCircleIcon className="size-4" />
                </TooltipIconButton>
              </ComposerPrimitive.StopDictation>
            </ComposerPrimitive.If>

            <span className="text-muted-foreground text-xs">
              支持 PDF / Word / PPT / 图片 / 视频
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThreadPrimitive.If running={false}>
              <ComposerPrimitive.Send asChild>
                <TooltipIconButton
                  tooltip="发送需求"
                  side="bottom"
                  variant="default"
                  size="icon"
                  className="size-9 rounded-full"
                  aria-label="发送需求"
                >
                  <ArrowUpIcon className="size-4" />
                </TooltipIconButton>
              </ComposerPrimitive.Send>
            </ThreadPrimitive.If>

            <ThreadPrimitive.If running>
              <ComposerPrimitive.Cancel asChild>
                <Button
                  type="button"
                  variant="default"
                  size="icon"
                  className="size-9 rounded-full"
                  aria-label="停止生成"
                >
                  <SquareIcon className="size-3 fill-current" />
                </Button>
              </ComposerPrimitive.Cancel>
            </ThreadPrimitive.If>
          </div>
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-teaching-message="true"
      data-teaching-role="assistant"
      className="mx-auto w-full max-w-(--thread-max-width) py-3"
    >
      <div
        data-teaching-content="true"
        className="rounded-[24px] border border-border/60 bg-background/85 px-4 py-4 text-foreground leading-relaxed shadow-sm"
      >
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            Reasoning,
            tools: { Fallback: ToolFallback },
          }}
        />
        <MessagePrimitive.Error>
          <ErrorPrimitive.Root className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
            <ErrorPrimitive.Message />
          </ErrorPrimitive.Root>
        </MessagePrimitive.Error>
      </div>

      <div className="mt-2 ml-2 flex items-center gap-2">
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="flex gap-1 text-muted-foreground"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="复制回复">
          <MessagePrimitive.If copied>
            <CheckIcon />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>

      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="重新生成">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-teaching-message="true"
      data-teaching-role="user"
      className="mx-auto grid w-full max-w-(--thread-max-width) grid-cols-[minmax(72px,1fr)_auto] gap-y-2 px-2 py-3 [&:where(>*)]:col-start-2"
    >
      <UserMessageAttachments />

      <div className="relative col-start-2 min-w-0">
        <div
          data-teaching-content="true"
          className="rounded-[24px] bg-primary px-4 py-3 text-primary-foreground shadow-sm"
        >
          <MessagePrimitive.Parts />
        </div>
        <div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker className="col-span-full col-start-1 row-start-3 justify-end" />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="编辑原始需求" className="p-4">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root className="mx-auto flex w-full max-w-(--thread-max-width) flex-col px-2 py-3">
      <ComposerPrimitive.Root className="ml-auto flex w-full max-w-[88%] flex-col rounded-[24px] border border-border/70 bg-background">
        <ComposerPrimitive.Input
          className="min-h-14 w-full resize-none bg-transparent p-4 text-foreground text-sm outline-none"
          autoFocus
        />
        <div className="mx-3 mb-3 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm">
              取消
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm">更新需求</Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "inline-flex items-center gap-1 text-muted-foreground text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="上一分支">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="下一分支">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
