"use client";

import { CheckCircle2, CircleDot, Sparkles } from "lucide-react";
import { useStudioStore } from "@/lib/studio-store";

const summaryRows = [
  { key: "teachingGoal", label: "教学目标" },
  { key: "audience", label: "对象学段" },
  { key: "duration", label: "时长安排" },
  { key: "outputStyle", label: "产出风格" },
] as const;

export const IntentSummaryCard = () => {
  const intentDraft = useStudioStore((state) => state.intentDraft);

  return (
    <section className="rounded-3xl border border-border/70 bg-card/90 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-medium text-primary text-sm">
            <Sparkles className="size-4" />
            需求结构化摘要
          </p>
          <h2 className="mt-1 font-semibold text-lg">教学意图理解面板</h2>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-muted-foreground text-xs">
          {intentDraft.confirmed ? (
            <CheckCircle2 className="size-3.5 text-primary" />
          ) : (
            <CircleDot className="size-3.5 text-chart-3" />
          )}
          {intentDraft.confirmed ? "需求已确认" : "仍需补充"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {summaryRows.map((row) => {
          const value = intentDraft[row.key];
          return (
            <div
              key={row.key}
              className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3"
            >
              <p className="text-muted-foreground text-xs">{row.label}</p>
              <p className="mt-1 min-h-6 font-medium text-sm">
                {value || "等待对话澄清"}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <TagGroup title="知识点清单" items={intentDraft.knowledgePoints} />
        <TagGroup title="逻辑顺序" items={intentDraft.logicSequence} />
        <TagGroup title="重点难点" items={intentDraft.keyDifficulties} />
      </div>

      <div className="mt-4 rounded-2xl bg-secondary/80 px-4 py-3">
        <p className="text-muted-foreground text-xs">最终需求确认</p>
        <p className="mt-1 text-sm leading-6">
          {intentDraft.finalRequirement ||
            "当前尚未完成最终确认，系统会继续主动追问缺失信息。"}
        </p>
      </div>

      <div className="mt-4">
        <p className="text-muted-foreground text-xs">待澄清项</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(intentDraft.missingFields.length > 0
            ? intentDraft.missingFields
            : ["已满足生成条件"]
          ).map((item) => (
            <span
              key={item}
              className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

const TagGroup = ({ title, items }: { title: string; items: string[] }) => {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
      <p className="text-muted-foreground text-xs">{title}</p>
      <div className="mt-2 flex min-h-10 flex-wrap gap-2">
        {(items.length > 0 ? items : ["待抽取"]).map((item) => (
          <span
            key={`${title}-${item}`}
            className="rounded-full bg-accent px-2.5 py-1 text-xs"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
};
