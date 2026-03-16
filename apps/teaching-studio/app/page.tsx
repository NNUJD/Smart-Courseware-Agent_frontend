"use client";

import { FileStack, GraduationCap, PlayCircle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Assistant } from "./assistant";

const WELCOME_SEEN_KEY = "teaching_studio_welcome_seen";

export default function Home() {
  const [showWelcome, setShowWelcome] = useState<boolean | null>(null);

  useEffect(() => {
    const seen = sessionStorage.getItem(WELCOME_SEEN_KEY) === "1";
    setShowWelcome(!seen);
  }, []);

  if (showWelcome === null) {
    return <div className="h-dvh w-full bg-background" />;
  }

  if (!showWelcome) {
    return <Assistant />;
  }

  return (
    <main className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_18%_15%,rgba(103,190,206,0.28),transparent_32%),radial-gradient(circle_at_86%_20%,rgba(244,193,113,0.22),transparent_30%),linear-gradient(180deg,#f8f6ef,#f0efe8)] px-5 py-7">
      <div className="absolute inset-auto top-16 left-12 h-28 w-28 -translate-y-6 rounded-full border border-primary/20 bg-primary/8 blur-sm" />
      <div className="absolute right-14 bottom-14 h-36 w-36 rounded-full border border-amber-300/30 bg-amber-100/40 blur-sm" />

      <section className="relative z-10 w-full max-w-5xl rounded-[36px] border border-border/70 bg-card/90 p-7 shadow-[0_18px_60px_rgba(19,49,92,0.14)] backdrop-blur">
        <div className="grid gap-7 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-primary text-xs">
              <Sparkles className="size-3.5" />
              Smart Courseware Agent
            </div>
            <h1 className="mt-4 max-w-2xl font-semibold text-4xl leading-[1.2] lg:text-5xl">
              教学设计工作台
            </h1>
            <p className="mt-4 max-w-2xl text-base text-muted-foreground leading-7">
              面向教师的智能课件工作流：左侧多轮澄清需求与资料绑定，右侧实时预览教案、PPT、视频和
              Word， 支持反馈再生成与一键导出。
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem(WELCOME_SEEN_KEY, "1");
                  setShowWelcome(false);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground text-sm transition hover:brightness-110"
              >
                <PlayCircle className="size-4" />
                进入工作台
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem(WELCOME_SEEN_KEY);
                  setShowWelcome(false);
                }}
                className="rounded-full border border-border/70 bg-background/80 px-5 py-2.5 text-foreground text-sm transition hover:border-primary/40 hover:bg-primary/5"
              >
                本次直接进入
              </button>
            </div>
          </div>

          <div className="grid gap-3.5 self-end">
            <FeatureCard
              icon={<GraduationCap className="size-5" />}
              title="多轮教学澄清"
              description="主动追问教学目标、知识点、课时和风格，形成结构化意图。"
            />
            <FeatureCard
              icon={<FileStack className="size-5" />}
              title="资料绑定与预览"
              description="上传 PDF / Word / PPT / 图片 / 视频，并映射到具体知识点。"
            />
            <FeatureCard
              icon={<Sparkles className="size-5" />}
              title="反馈再生成"
              description="支持局部修改建议，自动调整教案、课件结构与讲义输出。"
            />
          </div>
        </div>
      </section>
    </main>
  );
}

const FeatureCard = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => {
  return (
    <article className="rounded-3xl border border-border/70 bg-background/85 p-4 shadow-sm">
      <div className="flex items-center gap-2.5 text-primary">
        {icon}
        <h2 className="font-medium text-sm">{title}</h2>
      </div>
      <p className="mt-2 text-muted-foreground text-sm leading-6">
        {description}
      </p>
    </article>
  );
};
