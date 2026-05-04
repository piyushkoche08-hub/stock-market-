import React from 'react';
import useStore from '../store/useStore';
import { Bell, X, Newspaper, TrendingUp, Info, AlertCircle } from 'lucide-react';

const NotificationDropdown = ({ onClose }) => {
  const { notifications, clearNotifications } = useStore();

  return (
    <div className="absolute top-full right-0 mt-2 w-80 bg-slate-900 border border-white/10 shadow-2xl rounded-2xl overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="p-4 border-b border-white/5 flex justify-between items-center bg-slate-950/50">
        <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
          <Bell size={14} className="text-purple-500" />
          Terminal Alerts
        </h3>
        <button 
          onClick={clearNotifications}
          className="text-[10px] font-bold text-slate-500 hover:text-white transition-colors"
        >
          Clear All
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto no-scrollbar">
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
              <Bell size={20} className="text-slate-700" />
            </div>
            <p className="text-xs text-slate-500 font-medium">No new alerts available</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div key={notif.id} className="p-4 border-b border-white/5 hover:bg-white/2 transition-colors cursor-default">
              <div className="flex gap-3">
                <div className={`mt-0.5 p-1.5 rounded-lg ${
                  notif.type === 'news' ? 'bg-blue-500/10 text-blue-400' : 
                  notif.type === 'price' ? 'bg-secondary/10 text-secondary' : 
                  'bg-purple-500/10 text-purple-400'
                }`}>
                  {notif.type === 'news' ? <Newspaper size={14} /> : 
                   notif.type === 'price' ? <TrendingUp size={14} /> : 
                   <Info size={14} />}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[11px] font-bold text-white leading-tight">{notif.title}</span>
                    <span className="text-[9px] text-slate-600 font-mono whitespace-nowrap ml-2">{notif.time}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {notif.message}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-3 bg-slate-950/50 border-t border-white/5 text-center">
        <button className="text-[10px] font-black text-purple-400 hover:text-purple-300 uppercase tracking-widest transition-colors">
          View Detailed Journal
        </button>
      </div>
    </div>
  );
};

export default NotificationDropdown;
