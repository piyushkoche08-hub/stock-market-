import React from 'react';
import useStore from '../store/useStore';
import { Info } from 'lucide-react';

const MarketStatsGrid = () => {
  const { info } = useStore();

  const formatValue = (key, val) => {
    if (val === undefined || val === null || val === 0) return '--';
    
    if (key === 'Market Cap') {
        if (val >= 1e12) return (val / 1e12).toFixed(2) + 'T';
        if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
        if (val >= 1e7) return (val / 1e7).toFixed(2) + 'Cr';
        return (val / 1e6).toFixed(2) + 'M';
    }
    
    if (key === 'Volume') {
        if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
        if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
        return val.toLocaleString();
    }

    return val.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const rows = [
    { label: 'Open', value: info.open },
    { label: 'Prev Close', value: info.previousClose },
    { label: 'Day High', value: info.dayHigh },
    { label: 'Day Low', value: info.dayLow },
    { label: '52W High', value: info.fiftyTwoWeekHigh },
    { label: '52W Low', value: info.fiftyTwoWeekLow },
    { label: 'Volume', value: info.volume },
    { label: 'Market Cap', value: info.marketCap },
  ];

  return (
    <div className="bg-slate-900/30 border border-white/5 rounded-2xl overflow-hidden">
      <div className="p-3 border-b border-white/5 bg-slate-950/40 flex justify-between items-center">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Key Statistics</span>
        <Info size={12} className="text-slate-600" />
      </div>
      <table className="w-full text-[11px]">
        <tbody className="divide-y divide-white/5">
          {rows.map((row) => (
            <tr key={row.label} className="hover:bg-white/2 transition-colors group">
              <td className="px-4 py-2.5 text-slate-500 font-bold uppercase tracking-tight">{row.label}</td>
              <td className="px-4 py-2.5 text-right text-white font-mono font-bold">
                {formatValue(row.label, row.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* 52W Range Visualizer */}
      <div className="p-4 bg-slate-950/20 border-t border-white/5">
        <div className="flex justify-between text-[9px] font-black text-slate-600 uppercase mb-2">
            <span>52W Low</span>
            <span>52W High</span>
        </div>
        <div className="relative h-1 w-full bg-slate-800 rounded-full">
            {info.fiftyTwoWeekLow && info.fiftyTwoWeekHigh && (
                <div 
                    className="absolute h-full bg-blue-500 rounded-full"
                    style={{ 
                        left: '0', 
                        width: `${((info.currentPrice - info.fiftyTwoWeekLow) / (info.fiftyTwoWeekHigh - info.fiftyTwoWeekLow)) * 100}%` 
                    }}
                />
            )}
            <div 
                className="absolute w-2 h-2 bg-white rounded-full top-1/2 -translate-y-1/2 border border-slate-950 shadow-lg"
                style={{ 
                    left: `${((info.currentPrice - info.fiftyTwoWeekLow) / (info.fiftyTwoWeekHigh - info.fiftyTwoWeekLow)) * 100}%` 
                }}
            />
        </div>
      </div>
    </div>
  );
};

export default MarketStatsGrid;
