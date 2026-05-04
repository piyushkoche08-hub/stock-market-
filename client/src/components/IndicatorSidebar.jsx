import React from 'react';
import useStore from '../store/useStore';
import { 
  Check, Activity, BarChart2, Zap, Shield, Waves, Info, 
  TrendingUp, ArrowUpCircle, MousePointer2, Layers
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const IndicatorSidebar = () => {
  const { indicators, toggleIndicator, data } = useStore();

  const lastData = data[data.length - 1] || {};

  const indicatorList = [
    { 
      key: 'ema20', 
      name: 'EMA 20', 
      desc: 'Exponential Moving Average',
      color: '#3b82f6', 
      icon: <Activity size={14} />,
      value: lastData.EMA_20 
    },
    { 
      key: 'ema50', 
      name: 'EMA 50', 
      desc: 'Medium-term Trend',
      color: '#f59e0b', 
      icon: <TrendingUp size={14} />,
      value: lastData.EMA_50 
    },
    { 
      key: 'ema200', 
      name: 'EMA 200', 
      desc: 'Long-term Baseline',
      color: '#ef4444', 
      icon: <Layers size={14} />,
      value: lastData.EMA_200 
    },
    { 
      key: 'vwap', 
      name: 'VWAP', 
      desc: 'Volume Weighted Price',
      color: '#06b6d4', 
      icon: <Zap size={14} />,
      value: lastData.VWAP 
    },
    { 
      key: 'bb', 
      name: 'Bollinger Bands', 
      desc: 'Volatility Envelopes',
      color: '#94a3b8', 
      icon: <Shield size={14} />,
      value: lastData.Upper_BB ? `${lastData.Upper_BB.toFixed(1)}` : null 
    },
    { 
      key: 'rsi', 
      name: 'RSI (14)', 
      desc: 'Relative Strength Index',
      color: '#c084fc', 
      icon: <Waves size={14} />,
      value: lastData.RSI 
    },
    { 
      key: 'volume', 
      name: 'Volume', 
      desc: 'Market Participation',
      color: '#26a69a', 
      icon: <BarChart2 size={14} />,
      value: lastData.Volume ? (lastData.Volume / 1000).toFixed(1) + 'K' : null 
    },
    { 
      key: 'ai', 
      name: 'AI Alpha Signals', 
      desc: 'ML Buy/Sell Alerts',
      color: '#00D09C', 
      icon: <ArrowUpCircle size={14} />,
      value: lastData.RF_Confidence ? lastData.RF_Confidence.toFixed(1) + '%' : null 
    },
  ];

  return (
    <div className="w-72 border-r border-white/5 bg-[#131722] flex flex-col h-full">
      <div className="p-4 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-2 mb-1">
          <MousePointer2 size={16} className="text-blue-500" />
          <h3 className="text-sm font-bold text-white tracking-tight">Active Indicators</h3>
        </div>
        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Indicator Management</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {indicatorList.map((ind) => (
          <div
            key={ind.key}
            onClick={() => toggleIndicator(ind.key)}
            className={cn(
              "p-3 rounded-md transition-all cursor-pointer group flex flex-col gap-2",
              indicators[ind.key] 
                ? "bg-slate-800/40 border border-white/5 shadow-inner" 
                : "bg-transparent border border-transparent hover:bg-white/5"
            )}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div 
                  className={cn(
                    "w-8 h-8 rounded flex items-center justify-center transition-colors",
                    indicators[ind.key] ? "bg-white/5" : "bg-slate-900"
                  )}
                  style={{ color: indicators[ind.key] ? ind.color : '#475569' }}
                >
                  {ind.icon}
                </div>
                <div>
                  <div className={cn("text-xs font-bold transition-colors", indicators[ind.key] ? "text-white" : "text-slate-500 group-hover:text-slate-400")}>
                    {ind.name}
                  </div>
                  <div className="text-[9px] text-slate-600 font-medium group-hover:text-slate-500">{ind.desc}</div>
                </div>
              </div>
              
              <div className={cn(
                "w-5 h-5 rounded flex items-center justify-center border transition-all",
                indicators[ind.key] ? "bg-blue-600 border-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.4)]" : "bg-slate-900 border-white/10"
              )}>
                {indicators[ind.key] && <Check size={12} className="text-white" />}
              </div>
            </div>

            {indicators[ind.key] && ind.value && (
              <div className="flex items-center justify-between px-2 py-1.5 bg-black/20 rounded border border-white/5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Value</span>
                <span className="text-xs font-mono font-bold" style={{ color: ind.color }}>
                  {typeof ind.value === 'number' ? ind.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ind.value}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-4 mt-auto border-t border-white/5 bg-black/20">
        <div className="flex items-center gap-2 mb-2 text-slate-400">
            <Info size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Signal Status</span>
        </div>
        <div className="flex justify-between items-center text-[11px] font-bold">
            <span className="text-slate-500">ML Confidence</span>
            <span className="text-secondary">{lastData.RF_Confidence?.toFixed(2)}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
            <div className="h-full bg-secondary transition-all duration-1000" style={{ width: `${lastData.RF_Confidence || 0}%` }} />
        </div>
      </div>
    </div>
  );
};

export default IndicatorSidebar;
