import Screener from '@/components/Screener';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b1020] text-slate-200">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-[#0b1020] to-[#0b1020] pointer-events-none"></div>
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 h-screen flex flex-col">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              AlphaPulse Global
            </h1>
            <p className="text-slate-400 font-medium mt-1">Institutional-Grade Market Terminal</p>
          </div>
          <div className="flex gap-4">
            <button className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold shadow-lg shadow-blue-500/20 transition-all">
              Trade Now
            </button>
          </div>
        </header>

        <Screener />
      </div>
    </main>
  );
}
