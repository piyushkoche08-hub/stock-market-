import React from 'react';
import useStore from '../store/useStore';
import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';

/**
 * REUSABLE COMPONENTS FOR PRODUCTION-GRADE TABLE
 */

const MarketCell = ({ children, className = "", align = "left", width = "auto" }) => (
  <td 
    className={`px-4 py-4 ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${className}`} 
    style={{ width }}
  >
    {children}
  </td>
);

const MarketRow = ({ item }) => {
  const isPositive = item.changePercent >= 0;
  const colorClass = isPositive ? 'text-emerald-400' : 'text-rose-400';
  
  // Custom Sparkline SVG Rendering
  const renderSparkline = (data) => {
    if (!data || data.length < 2) return <div className="w-24 h-8 bg-white/5 rounded animate-pulse mx-auto" />;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((d, i) => ({
      x: (i / (data.length - 1)) * 100,
      y: 32 - ((d - min) / range) * 28 // 28px height with 2px padding
    }));
    const path = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
    
    return (
      <svg viewBox="0 0 100 32" className="w-24 h-8 overflow-visible mx-auto">
        <path
          d={path}
          fill="none"
          stroke={isPositive ? '#10b981' : '#ef4444'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.04] transition-all group cursor-pointer">
      <MarketCell width="30%">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors leading-tight">
            {item.name}
          </span>
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
            {item.symbol}
          </span>
        </div>
      </MarketCell>
      
      <MarketCell align="right" width="20%">
        <div className="flex flex-col items-end">
          <span className="text-base font-black text-white font-mono tracking-tighter">
            {item.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[9px] text-slate-600 font-bold uppercase">{item.currency}</span>
        </div>
      </MarketCell>
      
      <MarketCell align="right" width="20%">
        <div className={`flex flex-col items-end ${colorClass}`}>
          <div className="flex items-center gap-1 font-mono font-black text-xs">
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(item.changePercent).toFixed(2)}%
          </div>
          <span className="text-[9px] opacity-50 font-bold uppercase tracking-widest">Today's Shift</span>
        </div>
      </MarketCell>
      
      <MarketCell align="center" width="20%">
        {renderSparkline(item.sparkline)}
      </MarketCell>
      
      <MarketCell align="right" width="10%">
        <button className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white transition-all transform active:scale-90 group/btn shadow-lg hover:shadow-blue-500/20">
          <ExternalLink size={14} className="group-hover/btn:rotate-12 transition-transform" />
        </button>
      </MarketCell>
    </tr>
  );
};

const MarketTable = ({ data }) => (
  <div className="overflow-x-auto no-scrollbar">
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-white/10 bg-white/[0.03]">
          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-left">Market Index</th>
          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Last Price</th>
          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Change</th>
          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">5D Performance</th>
          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/5">
        {data.length === 0 ? (
          [...Array(5)].map((_, i) => (
            <tr key={i} className="animate-pulse border-b border-white/5">
              <td colSpan="5" className="px-4 py-8"><div className="h-4 bg-white/5 rounded w-full" /></td>
            </tr>
          ))
        ) : (
          data.map(item => <MarketRow key={item.symbol} item={item} />)
        )}
      </tbody>
    </table>
  </div>
);

/**
 * MAIN COMPONENT: MARKET OVERVIEW TABLE
 */
const MarketOverviewTable = () => {
  const { marketSummary } = useStore();

  return (
    <div className="bg-slate-900/40 border border-white/10 rounded-[12px] shadow-2xl overflow-hidden backdrop-blur-xl transition-all hover:border-white/20">
      <div className="p-5 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-white/[0.03] to-transparent">
        <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] flex items-center gap-2.5">
          <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
            <TrendingUp size={14} />
          </div>
          Global Markets Overview
        </h3>
        <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Live Sync</span>
        </div>
      </div>
      
      <MarketTable data={marketSummary} />
      
      <div className="p-3 bg-white/[0.02] border-t border-white/5 text-center group cursor-pointer hover:bg-white/[0.05] transition-all">
        <span className="text-[10px] font-black text-slate-500 group-hover:text-slate-300 uppercase tracking-widest flex items-center justify-center gap-2">
          Explore All Sectors <ExternalLink size={10} />
        </span>
      </div>
    </div>
  );
};

export default MarketOverviewTable;
