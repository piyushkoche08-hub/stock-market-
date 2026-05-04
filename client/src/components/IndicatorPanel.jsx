import React from 'react';
import useStore from '../store/useStore';
import { Check, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const IndicatorPanel = () => {
  const { indicators, toggleIndicator, data } = useStore();

  const lastData = data[data.length - 1] || {};

  const indicatorList = [
    { key: 'ema20', name: 'EMA 20', color: '#3b82f6', value: lastData.EMA_20 },
    { key: 'ema50', name: 'EMA 50', color: '#f59e0b', value: lastData.EMA_50 },
    { key: 'vwap', name: 'VWAP', color: '#06b6d4', value: lastData.VWAP },
    { key: 'bb', name: 'Bands', color: '#94a3b8', value: lastData.Upper_BB ? `${lastData.Upper_BB.toFixed(1)} / ${lastData.Lower_BB.toFixed(1)}` : null },
    { key: 'volume', name: 'Volume', color: '#26a69a', value: lastData.Volume ? (lastData.Volume / 1000000).toFixed(1) + 'M' : null },
  ];

  return (
    <div className="flex flex-wrap gap-2 p-3 bg-slate-900/40 border-b border-white/5">
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center mr-2">
        Indicators
      </span>
      {indicatorList.map((ind) => (
        <button
          key={ind.key}
          onClick={() => toggleIndicator(ind.key)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-[11px] font-bold",
            indicators[ind.key] 
              ? "bg-slate-800 border-white/10 text-white" 
              : "bg-transparent border-white/5 text-slate-500 hover:border-white/10"
          )}
        >
          <div 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: indicators[ind.key] ? ind.color : '#475569' }} 
          />
          <span className="opacity-80 uppercase tracking-tighter">{ind.name}</span>
          {indicators[ind.key] && ind.value && (
            <span className="ml-1 text-[10px] font-mono text-slate-400">
              {typeof ind.value === 'number' ? ind.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ind.value}
            </span>
          )}
          {indicators[ind.key] ? (
            <Check size={10} className="text-secondary ml-1" />
          ) : (
            <div className="w-2" />
          )}
        </button>
      ))}
    </div>
  );
};

export default IndicatorPanel;
