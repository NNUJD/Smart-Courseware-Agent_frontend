import Link from "next/link";

export default function BuoyancyVirtualLabPage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[linear-gradient(180deg,#f6efe6,#efe5d6)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-10 -left-20 h-64 w-64 rounded-full bg-teal-300/18 blur-3xl" />
        <div className="absolute top-0 right-0 h-80 w-80 rounded-full bg-cyan-200/22 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-200/24 blur-3xl" />
      </div>

      <Link
        href="/"
        className="absolute top-4 right-4 z-10 inline-flex items-center rounded-full border border-slate-300/80 bg-white/88 px-4 py-2 text-sm shadow-[0_12px_30px_rgba(40,54,58,0.12)] backdrop-blur transition-colors hover:border-slate-400 hover:bg-white"
      >
        返回工作台
      </Link>

      <iframe
        title="河边浮力投掷实验"
        src="/virtual-labs/assets/buoyancy/index.html"
        className="relative z-0 block h-full w-full border-0"
      />
    </main>
  );
}
