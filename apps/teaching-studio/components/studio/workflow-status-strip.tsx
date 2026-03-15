"use client";

import { CheckCircle2, Circle, LoaderCircle } from "lucide-react";
import { artifactTabs } from "@/lib/studio-contract";
import { useStudioStore } from "@/lib/studio-store";
import { cn } from "@/lib/utils";

type StepTone = "done" | "active" | "todo";

type WorkflowStep = {
  id: string;
  text: string;
  tone: StepTone;
};

const stepStyles: Record<StepTone, string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  active: "border-amber-200 bg-amber-50 text-amber-700",
  todo: "border-border/70 bg-background text-muted-foreground",
};

export const WorkflowStatusStrip = () => {
  const intentDraft = useStudioStore((state) => state.intentDraft);
  const artifacts = useStudioStore((state) => state.artifacts);
  const isSyncing = useStudioStore((state) => state.isSyncing);

  const hasGoal = intentDraft.teachingGoal.trim().length > 0;
  const hasStyle = intentDraft.outputStyle.trim().length > 0;
  const hasStructure = artifactTabs.some((tab) => {
    const artifact = artifacts[tab];
    return (
      artifact.sections.length > 0 ||
      artifact.slides.length > 0 ||
      artifact.storyboard.length > 0
    );
  });
  const hasFirstVersion = artifactTabs.some(
    (tab) => artifacts[tab].status === "ready",
  );
  const isGenerating =
    isSyncing ||
    artifactTabs.some((tab) => artifacts[tab].status === "generating");

  const steps: WorkflowStep[] = [
    {
      id: "goal",
      text: hasGoal ? "已提炼目标" : "待提炼目标",
      tone: hasGoal ? "done" : isGenerating ? "active" : "todo",
    },
    {
      id: "structure",
      text: hasStructure
        ? "结构已生成"
        : isGenerating
          ? "正在生成结构"
          : "待生成结构",
      tone: hasStructure ? "done" : isGenerating ? "active" : "todo",
    },
    {
      id: "style",
      text: hasStyle ? "风格已确认" : "等待你确认风格",
      tone: hasStyle ? "done" : hasStructure ? "active" : "todo",
    },
    {
      id: "draft",
      text: hasFirstVersion
        ? "首版已生成"
        : isGenerating
          ? "开始出首版"
          : "待出首版",
      tone: hasFirstVersion ? "done" : isGenerating ? "active" : "todo",
    },
  ];

  return (
    <section className="mb-4 rounded-3xl border border-border/70 bg-card/85 px-4 py-3 shadow-sm backdrop-blur-sm">
      <p className="font-medium text-primary text-sm">AI 自动步骤状态</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs",
                stepStyles[step.tone],
              )}
            >
              <StepIcon tone={step.tone} />
              {step.text}
            </span>
            {index < steps.length - 1 ? (
              <span className="text-muted-foreground text-xs">→</span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
};

const StepIcon = ({ tone }: { tone: StepTone }) => {
  if (tone === "done") {
    return <CheckCircle2 className="size-3.5" />;
  }

  if (tone === "active") {
    return <LoaderCircle className="size-3.5 animate-spin" />;
  }

  return <Circle className="size-3.5" />;
};
