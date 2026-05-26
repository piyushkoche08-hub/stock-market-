import Screener from "@/components/Screener";

export default function Home() {
  return (
    <main className="relative min-h-[100dvh] bg-[#0b1020] text-slate-200">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-[#0b1020] to-[#0b1020]" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col px-4 py-6 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 sm:text-3xl">
              AlphaPulse Global
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-400 sm:text-base">
              Institutional-Grade Market Terminal
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <button className="w-full rounded-full bg-blue-600 px-5 py-2.5 font-bold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-500 sm:w-auto">
              Trade Now
            </button>
          </div>
        </header>

        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          <Screener />
        </div>
      </div>
    </main>
  );
}
