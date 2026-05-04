import React, { useEffect } from 'react';
import useStore from '../store/useStore';
import { TrendingUp, TrendingDown } from 'lucide-react';

const MarketIndexTicker = () => {
  const { marketSummary } = useStore();

  // Filter to major indices for the top bar
  const majorIndices = marketSummary.filter(item => 
    ["NIFTY 50", "SENSEX", "NASDAQ", "S&P 500"].includes(item.name)
  );

  return (
    <div className="h-10 bg-slate-900/80 backdrop-blur-md border-b border-white/5 flex items-center px-6 gap-8 overflow-x-auto no-scrollbar">
      {majorIndices.length === 0 ? (
        <div className="flex gap-8">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="h-4 w-24 bg-white/5 rounded animate-pulse" />
            ))}
        </div>
      ) : (
        majorIndices.map((index) => {
          const isPositive = index.changePercent >= 0;
          return (
            <div key={index.symbol} className="flex items-center gap-3 shrink-0 group cursor-pointer">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-white transition-colors">{index.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white font-mono">{index.price.toLocaleString(undefined, { minimumFractionDigits: 1 })}</span>
                <div className={`flex items-center gap-0.5 text-[10px] font-black ${isPositive ? 'text-secondary' : 'text-error'}`}>
                  {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {Math.abs(index.changePercent).toFixed(2)}%
                </div>
              </div>
              <div className="w-[1px] h-3 bg-white/10 ml-2" />
            </div>
          );
        })
      )}
    </div>
  );
};

export default MarketIndexTicker;
