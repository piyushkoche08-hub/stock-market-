import WebSocket from 'ws';
import yahooFinance from 'yahoo-finance2';
import axios from 'axios';

interface ClientSub {
    ws: WebSocket;
    symbols: Set<string>;
}

export class MarketService {
    private clients: Map<WebSocket, ClientSub> = new Map();
    private activeSymbols: Set<string> = new Set();
    private pollingInterval: NodeJS.Timeout | null = null;
    private binanceWs: WebSocket | null = null;

    private readonly cryptoSymbolMap: Map<string, string> = new Map(); // e.g. BTC-USD -> BTCUSDT
    private readonly reverseCryptoMap: Map<string, string> = new Map(); // e.g. BTCUSDT -> BTC-USD

    public initialize() {
        this.startBinanceWebSocket();
        this.startYahooPolling();
        console.log("Market Service initialized with REAL data streams.");
    }

    public subscribeClient(ws: WebSocket, symbols: string[]) {
        let sub = this.clients.get(ws);
        if (!sub) {
            sub = { ws, symbols: new Set() };
            this.clients.set(ws, sub);
        }
        symbols.forEach(s => sub!.symbols.add(s));
        this.updateActiveSymbols();
    }

    public updateClientSubscriptions(ws: WebSocket, symbols: string[]) {
        const sub = this.clients.get(ws);
        if (sub) {
            sub.symbols = new Set(symbols);
            this.updateActiveSymbols();
        }
    }

    public removeClient(ws: WebSocket) {
        this.clients.delete(ws);
        this.updateActiveSymbols();
    }

    private updateActiveSymbols() {
        this.activeSymbols.clear();
        for (const sub of this.clients.values()) {
            for (const sym of sub.symbols) {
                this.activeSymbols.add(sym);
            }
        }
    }

    private startBinanceWebSocket() {
        this.binanceWs = new WebSocket('wss://stream.binance.com:9443/ws/!ticker@arr');
        
        this.binanceWs.on('message', (data: WebSocket.Data) => {
            try {
                const tickers = JSON.parse(data.toString());
                const updates: any[] = [];
                
                for (const t of tickers) {
                    const binanceSymbol = t.s;
                    // Check if anyone subscribed to the yahoo format or direct binance format
                    const yahooFormat = `${binanceSymbol.replace('USDT', '-USD')}`;
                    
                    if (this.activeSymbols.has(binanceSymbol) || this.activeSymbols.has(yahooFormat)) {
                        const symbol = this.activeSymbols.has(yahooFormat) ? yahooFormat : binanceSymbol;
                        updates.push({
                            symbol: symbol,
                            price: parseFloat(t.c),
                            change: parseFloat(t.p),
                            changePercent: parseFloat(t.P),
                            volume: parseFloat(t.v),
                            timestamp: t.E
                        });
                    }
                }

                if (updates.length > 0) {
                    this.broadcast(updates);
                }
            } catch (e) {
                // Ignore parsing errors for live stream
            }
        });

        this.binanceWs.on('close', () => {
            console.log('Binance WS closed. Reconnecting in 5s...');
            setTimeout(() => this.startBinanceWebSocket(), 5000);
        });

        this.binanceWs.on('error', (err) => {
            console.error('Binance WS Error:', err);
        });
    }

    private startYahooPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);

        this.pollingInterval = setInterval(async () => {
            const symbolsToPoll = Array.from(this.activeSymbols).filter(s => !s.endsWith('USDT'));
            if (symbolsToPoll.length === 0) return;

            // Chunk symbols to avoid rate limits
            const chunkSize = 50;
            for (let i = 0; i < symbolsToPoll.length; i += chunkSize) {
                const chunk = symbolsToPoll.slice(i, i + chunkSize);
                try {
                    const quotes = await yahooFinance.quote(chunk) as any[];
                    const updates = quotes.map((q: any) => ({
                        symbol: q.symbol,
                        price: q.regularMarketPrice,
                        change: q.regularMarketChange,
                        changePercent: q.regularMarketChangePercent,
                        volume: q.regularMarketVolume,
                        timestamp: Date.now()
                    }));
                    this.broadcast(updates);
                } catch (e) {
                    console.error('Yahoo Finance polling error:', e);
                }
            }
        }, 2000); // 2 second polling for stocks to simulate real-time
    }

    private broadcast(updates: any[]) {
        for (const [ws, sub] of this.clients.entries()) {
            if (ws.readyState === WebSocket.OPEN) {
                const relevantUpdates = updates.filter(u => sub.symbols.has(u.symbol));
                if (relevantUpdates.length > 0) {
                    ws.send(JSON.stringify({ type: 'price_updates', data: relevantUpdates }));
                }
            }
        }
    }

    public async searchSymbols(query: string) {
        try {
            // Use Yahoo Finance search to guarantee REAL symbols globally
            const result = await yahooFinance.search(query, { quotesCount: 15, newsCount: 0 }) as any;
            return result.quotes.map((q: any) => ({
                symbol: q.symbol,
                name: q.shortname || q.longname || q.symbol,
                exchange: q.exchange || 'Unknown',
                type: q.quoteType || 'EQUITY',
                sector: q.sector || 'N/A'
            }));
        } catch (e) {
            console.error('Search API failed:', e);
            return [];
        }
    }

    public async getMarketSummary() {
        const indices = ['^NSEI', '^BSESN', '^GSPC', '^DJI', '^IXIC', 'BTC-USD', 'ETH-USD', 'GC=F'];
        try {
            const quotes = await yahooFinance.quote(indices) as any[];
            return quotes.map((q: any) => ({
                symbol: q.symbol,
                name: q.shortname || q.longname || q.symbol,
                price: q.regularMarketPrice,
                change: q.regularMarketChange,
                changePercent: q.regularMarketChangePercent
            }));
        } catch (e) {
            console.error('Market summary error:', e);
            return [];
        }
    }
}

export const marketService = new MarketService();
