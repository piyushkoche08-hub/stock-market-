import React from 'react';
import useStore from '../store/useStore';
import { 
  Plus, 
  ChevronDown, 
  BarChart2, 
  Bell, 
  Rewind, 
  Undo2, 
  Redo2, 
  LayoutGrid,
  CandlestickChart,
  LineChart as LineChartIcon
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import NotificationDropdown from './NotificationDropdown';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const TopToolbar = () => {
  const { timeframe, setTimeframe, ticker, unreadCount } = useStore();
  const [showNotifications, setShowNotifications] = React.useState(false);

  const toolbarItemClass = "flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/5 rounded-md transition-all cursor-pointer text-slate-300 hover:text-white border-r border-white/5 last:border-0";

  return (
    <div className="h-12 bg-[#131722] border-b border-white/10 flex items-center px-2 select-none">
      {/* Search / Symbol */}
      <div className={cn(toolbarItemClass, "font-bold text-white pr-4")}>
        {ticker.split('.')[0]} <ChevronDown size={14} className="text-slate-500" />
      </div>

      {/* Plus icon */}
      <div className={cn(toolbarItemClass, "px-2")}>
        <Plus size={18} className="text-slate-400" />
      </div>

      {/* Timeframes */}
      <div className="flex items-center border-r border-white/5 pr-1">
        {['1m', '5m', '15m', '1h', '1d'].map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-bold transition-all mx-0.5",
              timeframe === tf ? "bg-blue-600/20 text-blue-400" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            )}
          >
            {tf}
          </button>
        ))}
        <ChevronDown size={14} className="text-slate-500 ml-1 cursor-pointer" />
      </div>

      {/* Chart Type */}
      <div className={toolbarItemClass}>
        <CandlestickChart size={18} className="text-slate-400" />
        <ChevronDown size={14} className="text-slate-500" />
      </div>

      {/* Indicators */}
      <div className={cn(toolbarItemClass, "gap-2")}>
        <BarChart2 size={18} className="text-blue-500" />
        <span className="text-sm font-medium text-slate-200">Indicators</span>
      </div>

      {/* Templates / Layout */}
      <div className={toolbarItemClass}>
        <LayoutGrid size={18} className="text-slate-400" />
      </div>

      <div className="w-[1px] h-6 bg-white/5 mx-2" />

      {/* Alert */}
      <div 
        className={cn(toolbarItemClass, "gap-2 relative")}
        onClick={() => setShowNotifications(!showNotifications)}
      >
        <div className="relative">
          <Bell size={18} className={cn(unreadCount > 0 ? "text-purple-400" : "text-slate-400")} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 text-[8px] font-black flex items-center justify-center rounded-full border border-slate-900 animate-pulse">
              {unreadCount}
            </span>
          )}
        </div>
        <span className="text-sm font-medium text-slate-200">Alert</span>
        {showNotifications && <NotificationDropdown onClose={() => setShowNotifications(false)} />}
      </div>

      {/* Replay */}
      <div className={cn(toolbarItemClass, "gap-2")}>
        <Rewind size={18} className="text-slate-400" />
        <span className="text-sm font-medium text-slate-200">Replay</span>
      </div>

      <div className="flex-1" />

      {/* History */}
      <div className="flex items-center gap-1 px-2 border-l border-white/5">
        <div className="p-1.5 hover:bg-white/5 rounded cursor-pointer text-slate-500">
          <Undo2 size={16} />
        </div>
        <div className="p-1.5 hover:bg-white/5 rounded cursor-pointer text-slate-500">
          <Redo2 size={16} />
        </div>
      </div>

      {/* Publish Button (Visual Polish) */}
      <button className="ml-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded transition-all">
        Publish
      </button>
    </div>
  );
};

export default TopToolbar;
