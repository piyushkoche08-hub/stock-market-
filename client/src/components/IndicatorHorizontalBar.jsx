import React from 'react';
import useStore from '../store/useStore';
import { Check, Activity, Zap, Shield, BarChart2, ArrowUpCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const IndicatorHorizontalBar = () => {
  const { indicators, toggleIndicator, data } = useStore();
  const lastData = data[data.length - 1] || {};

  const indicatorList = [
    { key: 'ema20', name: 'EMA 20', color: '#3b82f6', value: lastData.EMA_20 },
    { key: 'ema50', name: 'EMA 50', color: '#f59e0b', value: lastData.EMA_50 },
    { key: 'vwap', name: 'VWAP', color: '#06b6d4', value: lastData.VWAP },
    { key: 'bb', name: 'BB', color: '#94a3b8', value: lastData.Upper_BB ? lastData.Upper_BB.toFixed(1) : null },
    { key: 'volume', name: 'Vol', color: '#26a69a', value: lastData.Volume ? (lastData.Volume / 1000).toFixed(0) + 'K' : null },
    { key: 'ai', name: 'AI', color: '#00D09C', value: lastData.RF_Confidence ? lastData.RF_Confidence.toFixed(0) + '%' : null },
    {
      key: 'breakoutProb',
      name: 'Breakout Expo',
      color: '#f472b6',
      value: lastData.Breakout_Prob !== undefined && lastData.Breakout_Prob !== null ? `${lastData.Breakout_Prob}%` : null
    },
    { key: 'strategyZP', name: 'Strategy ZP', color: '#c084fc', value: lastData.ZP_Strategy_Signal === 1 ? 'BUY' : (lastData.ZP_Strategy_Signal === -1 ? 'SELL' : 'WAIT') },
  ];

  return (
    <div className="flex items-center gap-1 px-4 py-1.5 bg-[#1e222d]/50 border-b border-white/5 overflow-x-auto no-scrollbar">
      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mr-2 border-r border-white/10 pr-2">Indicators</span>
      <div className="flex items-center gap-1.5">
        {indicatorList.map((ind) => (
          <button
            key={ind.key}
            onClick={() => toggleIndicator(ind.key)}
            className={cn(
              "flex items-center gap-2 px-2 py-1 rounded transition-all whitespace-nowrap border",
              indicators[ind.key] 
                ? "bg-blue-600/10 border-blue-500/20 text-white" 
                : "bg-transparent border-transparent text-slate-500 hover:text-slate-300"
            )}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: indicators[ind.key] ? ind.color : '#475569' }} />
            <span className="text-[10px] font-bold uppercase tracking-tight">{ind.name}</span>
            {indicators[ind.key] && ind.value && (
              <span className="text-[10px] font-mono opacity-60">
                {typeof ind.value === 'number' ? ind.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : ind.value}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default IndicatorHorizontalBar;
