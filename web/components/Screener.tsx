'use client';
import { useEffect, useState, useRef } from 'react';
import { ArrowUpRight, ArrowDownRight, Search, Activity } from 'lucide-react';

interface MarketData {
    symbol: string;
    name?: string;
    price: number;
    change: number;
    changePercent: number;
    volume?: number;
}

export default function Screener() {
    const [symbols, setSymbols] = useState<string[]>(['RELIANCE.NS', 'TCS.NS', 'AAPL', 'TSLA', 'BTCUSDT', 'ETHUSDT', 'EURUSD=X', 'GC=F']);
    const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const wsRef = useRef<WebSocket | null>(null);

    // Initial setup and WS connection
    useEffect(() => {
        let ws: WebSocket;
        let reconnectTimeout: NodeJS.Timeout;

        const connect = () => {
            ws = new WebSocket('ws://localhost:8000');
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('Connected to Market Data Stream');
                ws.send(JSON.stringify({ type: 'subscribe', symbols }));
            };

            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'price_updates') {
                    setMarketData(prev => {
                        const newData = { ...prev };
                        message.data.forEach((update: MarketData) => {
                            newData[update.symbol] = { ...newData[update.symbol], ...update };
                        });
                        return newData;
                    });
                }
            };

            ws.onclose = () => {
                console.log('WS Disconnected. Reconnecting in 3s...');
                reconnectTimeout = setTimeout(connect, 3000);
            };
            
            ws.onerror = () => {
                ws.close();
            };
        };

        connect();

        return () => {
            clearTimeout(reconnectTimeout);
            ws?.close();
        };
    }, [symbols]);

    // Handle instant real symbol search
    useEffect(() => {
        if (searchQuery.length < 2) {
            setSearchResults([]);
            return;
        }
        const delayDebounceFn = setTimeout(async () => {
            try {
                const res = await fetch(`http://localhost:8000/api/search?q=${searchQuery}`);
                const data = await res.json();
                setSearchResults(data);
            } catch (e) {
                console.error("Search failed");
            }
        }, 300);
        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    const addSymbol = (symbol: string, name: string) => {
        if (!symbols.includes(symbol)) {
            const newSymbols = [symbol, ...symbols];
            setSymbols(newSymbols);
            setMarketData(prev => ({...prev, [symbol]: { symbol, name, price: 0, change: 0, changePercent: 0 }}));
            wsRef.current?.send(JSON.stringify({ type: 'subscribe', symbols: [symbol] }));
        }
        setSearchQuery('');
        setSearchResults([]);
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            {/* Search Bar */}
            <div className="relative z-50">
                <div className="relative flex items-center">
                    <Search className="absolute left-4 text-slate-400" size={20} />
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search ANY global stock, crypto, forex, or index (e.g. RELIANCE, AAPL, BTCUSDT)..." 
                        className="w-full bg-slate-800/50 border border-slate-700/50 rounded-2xl py-4 pl-12 pr-6 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-xl transition-all"
                    />
                </div>
                {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
                        {searchResults.map((res, i) => (
                            <button 
                                key={i}
                                onClick={() => addSymbol(res.symbol, res.name)}
                                className="w-full text-left px-6 py-4 border-b border-slate-700/50 hover:bg-blue-600/20 transition-colors flex justify-between items-center"
                            >
                                <div>
                                    <h4 className="text-white font-bold">{res.symbol}</h4>
                                    <p className="text-sm text-slate-400">{res.name}</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-semibold px-2 py-1 bg-slate-700 rounded text-slate-300 uppercase tracking-wider">{res.exchange}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Screener Table */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-xl flex-1 flex flex-col shadow-2xl">
                <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/60 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Activity className="text-blue-500" />
                        Live Global Market Watch
                    </h2>
                    <span className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        LIVE SYNC
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700/50 bg-slate-900/40">
                                <th className="px-6 py-4 font-semibold">Symbol</th>
                                <th className="px-6 py-4 font-semibold text-right">Price</th>
                                <th className="px-6 py-4 font-semibold text-right">Change</th>
                                <th className="px-6 py-4 font-semibold text-right">Change %</th>
                                <th className="px-6 py-4 font-semibold text-right">Volume</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {symbols.map(sym => {
                                const data = marketData[sym];
                                const isPositive = (data?.change || 0) >= 0;
                                const isZero = data?.price === 0;

                                return (
                                    <tr key={sym} className="hover:bg-slate-700/20 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-white font-bold">{sym}</span>
                                                <span className="text-xs text-slate-400 truncate max-w-[200px]">{data?.name || 'Loading...'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`font-mono font-bold text-lg ${isZero ? 'text-slate-500' : 'text-white'}`}>
                                                {isZero ? '--' : data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {isZero ? <span className="text-slate-500">--</span> : (
                                                <span className={`flex items-center justify-end font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {isPositive ? <ArrowUpRight size={16} className="mr-1" /> : <ArrowDownRight size={16} className="mr-1" />}
                                                    {Math.abs(data.change).toFixed(2)}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {isZero ? <span className="text-slate-500">--</span> : (
                                                <span className={`font-mono font-bold px-2 py-1 rounded ${isPositive ? 'bg-emerald-400/10 text-emerald-400' : 'bg-rose-400/10 text-rose-400'}`}>
                                                    {isPositive ? '+' : ''}{data.changePercent.toFixed(2)}%
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right text-slate-300 font-mono">
                                            {isZero ? '--' : (data.volume ? (data.volume / 1000000).toFixed(2) + 'M' : 'N/A')}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
