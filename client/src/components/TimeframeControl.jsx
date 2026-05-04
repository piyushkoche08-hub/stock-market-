import React from 'react';
import useStore from '../store/useStore';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const TimeframeControl = () => {
  const { timeframe, setTimeframe, fetchStockData } = useStore();

  const intervals = [
    { label: '1m', value: '1m' },
    { label: '3m', value: '3m' },
    { label: '5m', value: '5m' },
    { label: '10m', value: '10m' },
    { label: '15m', value: '15m' },
    { label: '30m', value: '30m' },
    { label: '1H', value: '1h' },
    { label: '1D', value: '1d' },
  ];

  const handleTimeframeChange = (val) => {
    setTimeframe(val);
    // Fetch happens automatically if we use a useEffect in App.jsx or here
  };

  return (
    <div className="flex bg-slate-900/60 p-1 rounded-xl border border-white/5">
      {intervals.map((int) => (
        <button
          key={int.value}
          onClick={() => handleTimeframeChange(int.value)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all uppercase tracking-wider",
            timeframe === int.value 
              ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20" 
              : "text-slate-500 hover:text-slate-300"
          )}
        >
          {int.label}
        </button>
      ))}
    </div>
  );
};

export default TimeframeControl;
