'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Search } from 'lucide-react';

interface MarketData {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
}

export default function Screener() {
  const [symbols, setSymbols] = useState<string[]>([
    'RELIANCE.NS',
    'TCS.NS',
    'AAPL',
    'TSLA',
    'BTCUSDT',
    'ETHUSDT',
    'EURUSD=X',
    'GC=F',
  ]);
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let ws: WebSocket | undefined;
    let reconnectTimeout: NodeJS.Timeout | undefined;

    const connect = () => {
      ws = new WebSocket('ws://localhost:8000');
      wsRef.current = ws;

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'subscribe', symbols }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'price_updates') {
          setMarketData((prev) => {
            const next = { ...prev };
            message.data.forEach((update: MarketData) => {
              next[update.symbol] = { ...next[update.symbol], ...update };
            });
            return next;
          });
        }
      };

      ws.onclose = () => {
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [symbols]);

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
      } catch {
        // ignore
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const addSymbol = (symbol: string, name: string) => {
    if (!symbols.includes(symbol)) {
      const nextSymbols = [symbol, ...symbols];
      setSymbols(nextSymbols);
      setMarketData((prev) => ({
        ...prev,
        [symbol]: { symbol, name, price: 0, change: 0, changePercent: 0 },
      }));
      wsRef.current?.send(JSON.stringify({ type: 'subscribe', symbols: [symbol] }));
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 sm:gap-6">
      <div className="relative z-50">
        <div className="relative flex items-center">
          <Search className="absolute left-3 sm:left-4 text-slate-400" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search any global stock, crypto, forex, or index (e.g. RELIANCE, AAPL, BTCUSDT)…"
            className="w-full rounded-2xl border border-slate-700/50 bg-slate-800/50 py-3 pl-10 pr-4 text-white placeholder-slate-400 backdrop-blur-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 sm:py-4 sm:pl-12 sm:pr-6"
          />
        </div>

        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 max-h-80 overflow-auto rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
            {searchResults.map((res, i) => (
              <button
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                onClick={() => addSymbol(res.symbol, res.name)}
                className="flex w-full items-center justify-between gap-4 border-b border-slate-700/50 px-4 py-3 text-left transition-colors hover:bg-blue-600/20 sm:px-6 sm:py-4"
              >
                <div className="min-w-0">
                  <h4 className="truncate font-bold text-white">{res.symbol}</h4>
                  <p className="truncate text-sm text-slate-400">{res.name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-300">
                    {res.exchange}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/40 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-700/50 bg-slate-800/60 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-bold text-white sm:text-lg">
            <Activity className="shrink-0 text-blue-500" />
            <span className="truncate">Live Global Market Watch</span>
          </h2>
          <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-400 sm:text-xs">
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400 align-middle" />
            LIVE
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur">
              <tr className="border-b border-slate-700/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:text-xs">
                <th className="px-3 py-3 sm:px-6 sm:py-4">Symbol</th>
                <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Price</th>
                <th className="hidden px-3 py-3 text-right sm:table-cell sm:px-6 sm:py-4">Change</th>
                <th className="px-3 py-3 text-right sm:px-6 sm:py-4">%</th>
                <th className="hidden px-3 py-3 text-right lg:table-cell lg:px-6 lg:py-4">Volume</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-700/50">
              {symbols.map((sym) => {
                const data = marketData[sym];
                const isPositive = (data?.change || 0) >= 0;
                const isZero = data?.price === 0;

                return (
                  <tr key={sym} className="group transition-colors hover:bg-slate-700/20">
                    <td className="px-3 py-3 sm:px-6 sm:py-4">
                      <div className="flex min-w-0 flex-col">
                        <span className="font-bold text-white">{sym}</span>
                        <span className="max-w-[12rem] truncate text-xs text-slate-400 sm:max-w-[18rem]">
                          {data?.name || 'Loading...'}
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right sm:px-6 sm:py-4">
                      <span className={`font-mono font-bold ${isZero ? 'text-slate-500' : 'text-white'} sm:text-lg`}>
                        {isZero
                          ? '--'
                          : data.price.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 4,
                            })}
                      </span>
                    </td>

                    <td className="hidden px-3 py-3 text-right sm:table-cell sm:px-6 sm:py-4">
                      {isZero ? (
                        <span className="text-slate-500">--</span>
                      ) : (
                        <span
                          className={`inline-flex items-center justify-end font-mono font-semibold ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? (
                            <ArrowUpRight size={16} className="mr-1" />
                          ) : (
                            <ArrowDownRight size={16} className="mr-1" />
                          )}
                          {Math.abs(data.change).toFixed(2)}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right sm:px-6 sm:py-4">
                      {isZero ? (
                        <span className="text-slate-500">--</span>
                      ) : (
                        <span
                          className={`rounded px-2 py-1 font-mono font-bold ${
                            isPositive
                              ? 'bg-emerald-400/10 text-emerald-400'
                              : 'bg-rose-400/10 text-rose-400'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {data.changePercent.toFixed(2)}%
                        </span>
                      )}
                    </td>

                    <td className="hidden px-3 py-3 text-right font-mono text-slate-300 lg:table-cell lg:px-6 lg:py-4">
                      {isZero ? '--' : data.volume ? `${(data.volume / 1_000_000).toFixed(2)}M` : 'N/A'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

