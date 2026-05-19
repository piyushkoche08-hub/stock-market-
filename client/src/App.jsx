import React, { useEffect, useState, useRef } from 'react';
import useStore from './store/useStore';
import TradingChart from './components/TradingChart';
import IndicatorHorizontalBar from './components/IndicatorHorizontalBar';
import TimeframeControl from './components/TimeframeControl';
import TopToolbar from './components/TopToolbar';
import MarketStatsGrid from './components/MarketStatsGrid';
import StrategyPanel from './components/StrategyPanel';
import MarketOverviewTable from './components/MarketOverviewTable';
import MarketIndexTicker from './components/MarketIndexTicker';
import { Search, Brain, TrendingUp, Newspaper, ChevronRight, Activity, Wallet, Target, Info, Sparkles } from 'lucide-react';

const App = () => {
  const { ticker, timeframe, period, fetchStockData, pollLatestPrice, info, loading, setTicker, news } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    fetchStockData();
    // Real-time polling for the current candle (5s)
    const interval = setInterval(pollLatestPrice, 5000); 
    
    // Centralized Market Summary Polling
    const stopPolling = useStore.getState().startMarketPolling();
    
    return () => {
      clearInterval(interval);
      stopPolling();
    };
  }, [ticker, timeframe, period, fetchStockData, pollLatestPrice]);

  // Handle Search
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length > 1) {
        try {
          const res = await fetch(`/api/search?q=${searchQuery}`);
          const data = await res.json();
          setSearchResults(data.results || []);
          setShowResults(true);
        } catch (e) {
          console.error(e);
        }
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Close search on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectTicker = (t) => {
    setTicker(t);
    setSearchQuery('');
    setShowResults(false);
  };

  return (
    <div className="flex h-screen bg-[#020617] text-slate-300 font-sans overflow-hidden">
      {/* Navigation Sidebar */}
      <div className="w-20 flex flex-col items-center py-8 gap-8 border-r border-white/5 bg-slate-950/50">
        <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20 cursor-pointer hover:scale-105 transition-transform">
          <Activity className="text-white" />
        </div>
        <div className="flex flex-col gap-6">
          <div className="p-3 text-purple-400 bg-purple-500/10 rounded-xl cursor-pointer">
            <TrendingUp size={22} />
          </div>
          <div className="p-3 text-slate-600 hover:text-slate-400 transition-colors cursor-pointer">
            <Wallet size={22} />
          </div>
          <div className="p-3 text-slate-600 hover:text-slate-400 transition-colors cursor-pointer">
            <Newspaper size={22} />
          </div>
          <div className="p-3 text-slate-600 hover:text-slate-400 transition-colors cursor-pointer">
            <Target size={22} />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopToolbar />
        <IndicatorHorizontalBar />
        
        <MarketIndexTicker />

        {/* Symbol Overview Header (Sub-header) */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-white/5 bg-slate-900/10">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-black text-white">{info.name || ticker}</h1>
                <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded font-mono border border-blue-500/20">{ticker}</span>
              </div>
            </div>
            <div className="w-[1px] h-8 bg-white/5" />
            <div className="flex items-center gap-4">
                <span className="text-xl font-bold text-white font-mono tracking-tighter">
                  {info.currentPrice?.toLocaleString()}
                </span>
                <div className={`flex flex-col ${info.regularMarketChangePercent >= 0 ? 'text-secondary' : 'text-danger'}`}>
                    <span className="text-xs font-black leading-none">
                        {info.regularMarketChangePercent >= 0 ? '+' : ''}{info.regularMarketChangePercent?.toFixed(2)}%
                    </span>
                    <span className="text-[10px] opacity-60 font-medium">Market Live</span>
                </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
              <div className="relative" ref={searchRef}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input 
                    type="text" 
                    placeholder="Search symbol..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchResults.length > 0) {
                        selectTicker(searchResults[0].ticker);
                      }
                    }}
                    className="bg-slate-900/40 border border-white/5 rounded-lg pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:border-blue-500/30 w-48 transition-all"
                />
                {showResults && (
                    <div className="absolute top-full mt-1 left-0 right-0 glass-panel bg-[#1e222d] border border-white/10 shadow-2xl z-50 max-h-64 overflow-y-auto w-72">
                    {searchResults.length > 0 ? searchResults.map(res => (
                        <div 
                        key={res.ticker} 
                        onClick={() => selectTicker(res.ticker)}
                        className="p-3 hover:bg-white/5 cursor-pointer flex justify-between items-center border-b border-white/5 last:border-0 group"
                        >
                        <div className="flex-1 min-w-0 pr-2">
                            <div className="text-xs font-bold text-white truncate group-hover:text-blue-400 transition-colors">{res.name}</div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 font-mono font-black">{res.ticker}</span>
                                <span className="text-[8px] px-1 bg-white/5 text-slate-600 rounded uppercase">{res.exchange}</span>
                            </div>
                        </div>
                        <ChevronRight size={12} className="text-slate-700 group-hover:text-blue-500 transition-colors" />
                        </div>
                    )) : (
                      <div className="p-4 text-center text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                        No results found
                      </div>
                    )}
                    </div>
                )}
              </div>
          </div>
        </div>

        {/* Dashboard Grid - Professional 3-Column Layout */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Sidebar: Market Watch & Global Indices */}
          <div className="w-72 border-r border-white/5 bg-slate-950/20 flex flex-col overflow-hidden">
             <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Market Watch</span>
                <div className="flex gap-1">
                   <div className="w-1.5 h-1.5 rounded-full bg-secondary"></div>
                </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
                <MarketOverviewTable />
                
                <div className="space-y-3">
                   <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Momentum Assets</span>
                      <Sparkles size={12} className="text-purple-400" />
                   </div>
                   {['TCS.NS', 'AAPL', 'NVDA', 'BTC-USD'].map(m => (
                      <div 
                         key={m} 
                         onClick={() => selectTicker(m)}
                         className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group ${ticker === m ? 'bg-purple-500/10 border-purple-500/20' : 'bg-transparent border-transparent hover:bg-white/5'}`}
                      >
                         <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded bg-slate-900 border border-white/5 flex items-center justify-center text-[9px] font-black text-slate-500 group-hover:text-blue-400">
                               {m.charAt(0)}
                            </div>
                            <span className="text-xs font-bold text-slate-300 group-hover:text-white">{m}</span>
                         </div>
                         <ChevronRight size={12} className="text-slate-700 opacity-0 group-hover:opacity-100 transition-all" />
                      </div>
                   ))}
                </div>
             </div>
          </div>

          {/* Center: Chart Section */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#020617]">
            <div className="flex-1 p-6 relative">
              <div className="absolute top-10 left-12 z-10 pointer-events-none space-y-4">
                <div className="flex flex-col gap-1">
                   <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Stream Protocol v2.1</div>
                   <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                     <span className="text-xs font-bold text-slate-300">Live Feed Syncing</span>
                   </div>
                </div>
                
                {/* Micro Chart Overlay (Visual Polish) */}
                <div className="bg-slate-900/40 backdrop-blur-sm border border-white/5 p-3 rounded-xl hidden xl:block">
                    <div className="flex items-center gap-3 mb-2">
                        <Sparkles size={14} className="text-purple-400" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alpha Signals</span>
                    </div>
                    <div className="flex gap-2">
                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded ${info.recommendation?.includes('Buy') ? 'bg-secondary/20 text-secondary' : 'bg-danger/20 text-danger'}`}>
                            {info.recommendation?.toUpperCase() || 'HOLD'}
                        </div>
                        <div className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-slate-400">
                            VOL: {(info.volume / 1000000).toFixed(1)}M
                        </div>
                    </div>
                </div>
              </div>
              
              <div className="w-full h-full glass-panel overflow-hidden p-2 shadow-2xl">
                <TradingChart />
              </div>
            </div>
          </div>

          {/* Right Sidebar: Deep Analytics & News */}
          <div className="w-80 border-l border-white/5 bg-slate-950/20 p-6 flex flex-col gap-6 overflow-y-auto no-scrollbar">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-400 border border-purple-500/20">
                <Brain size={20} />
              </div>
              <div>
                <h3 className="font-bold text-white tracking-tight">AI Neural Engine</h3>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Analytics Core</p>
              </div>
            </div>

            <div className="glass-panel p-5 space-y-4 border-purple-500/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 blur-3xl rounded-full -mr-12 -mt-12" />
              <div className="flex justify-between items-center relative">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Sentiment</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${info.trend === 'Bullish' ? 'bg-secondary/10 text-secondary' : (info.trend === 'Bearish' ? 'bg-danger/10 text-danger' : 'bg-slate-800 text-slate-400')}`}>
                  {info.trend || 'Neutral'}
                </span>
              </div>
              <div className="flex justify-between items-center relative">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Confidence</span>
                <span className="text-xs text-white font-mono font-bold">{info.confidence}%</span>
              </div>
              <div className="h-2 w-full bg-slate-800/50 rounded-full overflow-hidden p-[1px] border border-white/5">
                <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(168,85,247,0.4)]" style={{ width: `${info.confidence}%` }} />
              </div>
              <div className="pt-4 border-t border-white/5 relative">
                <div className="flex items-center gap-2 mb-1">
                    <Target size={12} className="text-purple-400" />
                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">5D Projection</div>
                </div>
                <div className="text-2xl font-black text-white font-mono tracking-tighter">
                  {info.currency === 'INR' ? '₹' : '$'}{info.targetPrice?.toLocaleString() || '--'}
                </div>
              </div>
            </div>

            {/* Market Stats Grid */}
            <MarketStatsGrid />

            {/* Advanced Strategy Analysis */}
            <StrategyPanel />

            <div className="flex items-center justify-between mt-2">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Newspaper size={16} className="text-purple-400" />
                Latest News
              </h3>
            </div>

            <div className="space-y-3 overflow-y-auto pr-1 no-scrollbar">
              {news.length === 0 ? (
                <div className="text-center py-4 opacity-50 text-[10px]">No recent news found for {ticker}</div>
              ) : (
                news.slice(0, 5).map((item, idx) => (
                  <a 
                    key={idx}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-xl border border-white/5 bg-slate-900/20 hover:bg-white/5 transition-all group"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] font-black text-purple-500 uppercase tracking-widest">{item.publisher}</span>
                      <span className="text-[8px] text-slate-600 font-mono">
                        {new Date(item.providerPublishTime * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 className="text-[11px] font-bold text-slate-300 leading-snug group-hover:text-white transition-colors line-clamp-2">
                      {item.title}
                    </h4>
                  </a>
                ))
              )}
            </div>

            {/* Newsletter/Insights Box */}
            <div className="mt-auto pt-6 border-t border-white/5">
                <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <Info size={14} className="text-slate-500" />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Market Insight</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-400 italic">
                        "High institutional volume detected in {ticker}. Momentum shift expected near resistance levels."
                    </p>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
