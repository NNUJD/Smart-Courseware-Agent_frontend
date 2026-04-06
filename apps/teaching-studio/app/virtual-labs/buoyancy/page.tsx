import Link from "next/link";

export default function BuoyancyVirtualLabPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f6efe6,#efe5d6)] p-4 text-slate-900 md:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-slate-300/70 bg-white/75 px-5 py-4 shadow-sm backdrop-blur">
          <div>
            <p className="font-semibold text-[11px] text-teal-800/80 uppercase tracking-[0.24em]">
              Virtual Lab
            </p>
            <h1 className="mt-1 font-semibold text-2xl">浮力虚拟仿真实验</h1>
            <p className="mt-1 text-slate-600 text-sm">
              前端内置仿真页，直接从当前项目打开，不再依赖后端跳转。
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm transition-colors hover:border-slate-400 hover:bg-slate-50"
          >
            返回工作台
          </Link>
        </header>

        <section className="min-h-0 flex-1 overflow-hidden rounded-[32px] border border-slate-300/70 bg-white/70 shadow-sm backdrop-blur">
          <iframe
            title="浮力虚拟仿真实验"
            src="/virtual-labs/assets/buoyancy/index.html"
            className="h-[calc(100vh-132px)] w-full border-0"
          />
        </section>
      </div>
    </main>
  );
}
