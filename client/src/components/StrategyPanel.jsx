import React from 'react';
import useStore from '../store/useStore';
import { Target, Zap, Activity, ShieldCheck, Gauge, TrendingUp, TrendingDown } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const StrategyPanel = () => {
  const { info, data, indicators } = useStore();
  const lastData = data[data.length - 1] || {};

  if (!indicators.strategyZP && !indicators.breakoutProb) return null;

  const breakoutProb = lastData.Breakout_Prob || 0;
  const zpSignal = lastData.ZP_Strategy_Signal || 0; // 1: Buy, -1: Sell, 0: Neutral
  const zpStrength = lastData.ZP_Strategy_Strength || 0;

  // Breakdown of ZP components (derived from logic in services.py)
  const isTrendUp = lastData.Close > lastData.EMA_20 && lastData.EMA_20 > lastData.EMA_50;
  const isTrendDown = lastData.Close < lastData.EMA_20 && lastData.EMA_20 < lastData.EMA_50;
  const isMomUp = lastData.RSI > 60;
  const isMomDown = lastData.RSI < 40;
  const isVolHigh = (lastData.Volume / (data.slice(-20).reduce((acc, d) => acc + d.Volume, 0) / 20)) > 1.1;

  return (
    <div className="flex flex-col gap-4">
      {/* Breakout Probability Expo Section */}
      {indicators.breakoutProb && (
        <div className="glass-panel p-5 border-pink-500/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-pink-500/5 blur-3xl rounded-full -mr-10 -mt-10 group-hover:bg-pink-500/10 transition-colors" />
          
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-pink-500/10 rounded-lg text-pink-400">
              <Zap size={14} />
            </div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Breakout Probability Expo</span>
          </div>

          <div className="flex items-end justify-between mb-2">
            <div className="text-3xl font-black text-white font-mono tracking-tighter">
              {breakoutProb}%
            </div>
            <div className={cn(
              "text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider mb-1",
              breakoutProb > 70 ? "bg-secondary/10 text-secondary" : 
              (breakoutProb > 40 ? "bg-amber-500/10 text-amber-400" : "bg-slate-800 text-slate-500")
            )}>
              {breakoutProb > 70 ? 'High Prob' : (breakoutProb > 40 ? 'Moderate' : 'Low Prob')}
            </div>
          </div>

          <div className="h-1.5 w-full bg-slate-800/50 rounded-full overflow-hidden p-[1px] border border-white/5">
            <div 
              className="h-full bg-gradient-to-r from-pink-600 to-rose-400 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(219,39,119,0.4)]" 
              style={{ width: `${breakoutProb}%` }} 
            />
          </div>
          
          <p className="mt-3 text-[10px] text-slate-500 leading-relaxed italic">
            {breakoutProb > 70 
              ? "Critical squeeze detected. High probability of explosive volatility expansion." 
              : "Market consolidating within range. Watching for volume confirmation."}
          </p>
        </div>
      )}

      {/* DIY Custom Strategy Builder ZP Section */}
      {indicators.strategyZP && (
        <div className="glass-panel p-5 border-purple-500/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 blur-3xl rounded-full -mr-10 -mt-10 group-hover:bg-purple-500/10 transition-colors" />
          
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-purple-500/10 rounded-lg text-purple-400">
              <Target size={14} />
            </div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Custom Strategy Builder ZP</span>
          </div>

          <div className="space-y-3">
            {/* Component Checklist */}
            <div className="grid grid-cols-2 gap-2">
              <div className={cn(
                "p-2 rounded-lg border text-[9px] font-bold flex items-center justify-between",
                isTrendUp ? "bg-secondary/5 border-secondary/20 text-secondary" : 
                (isTrendDown ? "bg-danger/5 border-danger/20 text-danger" : "bg-white/5 border-white/5 text-slate-500")
              )}>
                <span>TREND</span>
                {isTrendUp ? <TrendingUp size={10} /> : (isTrendDown ? <TrendingDown size={10} /> : <Activity size={10} />)}
              </div>
              <div className={cn(
                "p-2 rounded-lg border text-[9px] font-bold flex items-center justify-between",
                isMomUp ? "bg-secondary/5 border-secondary/20 text-secondary" : 
                (isMomDown ? "bg-danger/5 border-danger/20 text-danger" : "bg-white/5 border-white/5 text-slate-500")
              )}>
                <span>MOMENTUM</span>
                <Gauge size={10} />
              </div>
              <div className={cn(
                "p-2 rounded-lg border text-[9px] font-bold flex items-center justify-between col-span-2",
                isVolHigh ? "bg-purple-500/5 border-purple-500/20 text-purple-400" : "bg-white/5 border-white/5 text-slate-500"
              )}>
                <span>INSTITUTIONAL VOLUME</span>
                <ShieldCheck size={10} />
              </div>
            </div>

            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Strategy Verdict</span>
                <div className={cn(
                  "text-lg font-black tracking-tighter",
                  zpSignal === 1 ? "text-secondary" : (zpSignal === -1 ? "text-danger" : "text-white")
                )}>
                  {zpSignal === 1 ? 'STRONG BUY' : (zpSignal === -1 ? 'STRONG SELL' : 'NEUTRAL / WAIT')}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Confidence</span>
                <div className="text-lg font-black text-white font-mono">{zpStrength}%</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StrategyPanel;
