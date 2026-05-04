import React from 'react';
import useStore from '../store/useStore';
import { Settings, X, Eye, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const ChartLegend = () => {
  const { ticker, data, info, indicators, toggleIndicator } = useStore();
  
  const lastPoint = data[data.length - 1] || {};
  const isPositive = info.regularMarketChangePercent >= 0;

  const activeIndicators = [
    { key: 'ema20', name: 'EMA 20', color: '#3b82f6', value: lastPoint.EMA_20 },
    { key: 'ema50', name: 'EMA 50', color: '#f59e0b', value: lastPoint.EMA_50 },
    { key: 'vwap', name: 'VWAP', color: '#06b6d4', value: lastPoint.VWAP },
    { key: 'bb', name: 'BB 20 2', color: '#94a3b8', value: lastPoint.Upper_BB ? `${lastPoint.Upper_BB.toFixed(1)} ${lastPoint.Lower_BB.toFixed(1)}` : null },
    { key: 'rsi', name: 'RSI 14', color: '#c084fc', value: lastPoint.RSI },
  ].filter(ind => indicators[ind.key]);

  return (
    <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 pointer-events-none select-none">
      {/* Symbol & OHLC */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <span className="text-sm font-black text-white">{ticker.split('.')[0]}</span>
        <span className="text-[10px] text-slate-500 font-bold">5 • NSE • TradingView</span>
        
        <div className="flex gap-2 ml-2">
          <span className="text-[11px] text-slate-400">O<span className="ml-1 text-white">{lastPoint.Open?.toFixed(2)}</span></span>
          <span className="text-[11px] text-slate-400">H<span className="ml-1 text-white">{lastPoint.High?.toFixed(2)}</span></span>
          <span className="text-[11px] text-slate-400">L<span className="ml-1 text-white">{lastPoint.Low?.toFixed(2)}</span></span>
          <span className="text-[11px] text-slate-400">C<span className="ml-1 text-white">{lastPoint.Close?.toFixed(2)}</span></span>
          <span className={cn("text-[11px] font-bold", isPositive ? "text-secondary" : "text-danger")}>
            {info.regularMarketChangePercent >= 0 ? '+' : ''}{info.regularMarketChangePercent?.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Indicator List */}
      <div className="flex flex-col gap-0.5 mt-1">
        {activeIndicators.map(ind => (
          <div key={ind.key} className="flex items-center gap-2 group pointer-events-auto">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-300">{ind.name}</span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Eye size={10} className="text-slate-500 hover:text-white cursor-pointer" onClick={() => toggleIndicator(ind.key)} />
                <Settings size={10} className="text-slate-500 hover:text-white cursor-pointer" />
                <X size={10} className="text-slate-500 hover:text-white cursor-pointer" onClick={() => toggleIndicator(ind.key)} />
              </div>
            </div>
            <div className="flex gap-2">
              <span className="text-[11px] font-bold font-mono" style={{ color: ind.color }}>
                {typeof ind.value === 'number' ? ind.value.toFixed(2) : ind.value}
              </span>
            </div>
          </div>
        ))}
        
        {/* RF Signal Special Display (Matches Image) */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] font-bold text-[#00D09C]">RF - B&S Signals close 20 3.5</span>
          <span className="text-[11px] font-mono font-bold text-[#00D09C]">
            {lastPoint.RF_Confidence ? lastPoint.RF_Confidence.toFixed(2) : '0.00'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChartLegend;
