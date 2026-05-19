import { create } from 'zustand'

const useStore = create((set, get) => ({
  ticker: 'RELIANCE.NS',
  timeframe: '1d', // interval
  period: '6mo',
  data: [],
  predictions: [],
  info: {},
  loading: false,
  error: null,
  cache: {}, // Simple memory cache

  // Indicators State
  indicators: {
    ema20: true,
    ema50: true,
    vwap: true,
    bb: true,
    rsi: true,
    volume: true,
    breakoutProb: true,
    strategyZP: true,
  },

  news: [],
  notifications: [],
  unreadCount: 0,
  marketSummary: [],
  toggleIndicator: (key) => set((state) => ({
    indicators: { ...state.indicators, [key]: !state.indicators[key] }
  })),

  setTicker: (ticker) => set({ ticker, data: [], predictions: [], news: [] }),
  setTimeframe: (timeframe) => set({ timeframe }),
  setPeriod: (period) => set({ period }),
  
  clearNotifications: () => set({ notifications: [], unreadCount: 0 }),
  addNotification: (notif) => set((state) => ({ 
    notifications: [notif, ...state.notifications].slice(0, 20),
    unreadCount: state.unreadCount + 1
  })),

  fetchMarketSummary: async () => {
    try {
      const res = await fetch('/api/market-summary');
      if (!res.ok) return;
      const data = await res.json();
      set({ marketSummary: data.summary || [] });
    } catch (e) {
      console.error("Failed to fetch market summary", e);
    }
  },

  startMarketPolling: () => {
    // Initial fetch
    get().fetchMarketSummary();
    // Poll every 30s
    const interval = setInterval(() => {
      get().fetchMarketSummary();
    }, 30000);
    return () => clearInterval(interval);
  },

  fetchStockData: async () => {
    const { ticker, timeframe, period, cache } = get();
    const cacheKey = `${ticker}_${timeframe}_${period}`;
    
    if (cache[cacheKey]) {
      const cached = cache[cacheKey];
      set({ 
        data: cached.data, 
        predictions: cached.predictions, 
        info: cached.info,
        loading: false 
      });
      // Also fetch news in parallel
      get().fetchNews();
      return;
    }

    set({ loading: true, error: null });
    try {
      const response = await fetch(`/api/stocks/${ticker}?interval=${timeframe}&period=${period}`);
      if (!response.ok) throw new Error('Failed to fetch data');
      const result = await response.json();
      
      set((state) => ({
        data: result.data,
        predictions: result.predictions,
        info: result.info,
        loading: false,
        cache: { ...state.cache, [cacheKey]: result }
      }));
      
      // Fetch news after stock data
      get().fetchNews();

      // Check for price alerts (Example)
      const lastPrice = result.info?.currentPrice;
      if (lastPrice) {
        get().addNotification({
          id: Date.now(),
          type: 'price',
          title: `${ticker} Data Synchronized`,
          message: `Current Price: ${result.info.currency === 'INR' ? '₹' : '$'}${lastPrice.toLocaleString()}`,
          time: new Date().toLocaleTimeString()
        });
      }

    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  fetchNews: async () => {
    const { ticker } = get();
    try {
      const res = await fetch(`/api/news/${ticker}`);
      const data = await res.json();
      set({ news: data.news || [] });
      
      // Add news notification if new items found
      if (data.news && data.news.length > 0) {
        get().addNotification({
          id: Date.now() + 1,
          type: 'news',
          title: 'Market Insights Updated',
          message: `Latest headlines for ${ticker} are now available.`,
          time: new Date().toLocaleTimeString()
        });
      }
    } catch (e) {
      console.error("News fetch failed", e);
    }
  },

  pollLatestPrice: async () => {
    const { ticker, timeframe, period, data } = get();
    if (!ticker || data.length === 0) return;

    try {
      // Use a very short period for polling to get only the current candle
      const response = await fetch(`/api/stocks/${ticker}?interval=${timeframe}&period=1d`);
      if (!response.ok) return;
      const result = await response.json();
      const newData = result.data || [];
      if (newData.length === 0) return;

      const lastNew = newData[newData.length - 1];
      const lastExisting = data[data.length - 1];

      // Update the current candle if it's the same time, otherwise append if it's newer
      if (lastNew.Date === lastExisting.Date) {
        const updatedData = [...data];
        updatedData[updatedData.length - 1] = lastNew;
        set({ data: updatedData });
      } else if (new Date(lastNew.Date) > new Date(lastExisting.Date)) {
        set({ data: [...data, lastNew] });
      }
    } catch (err) {
      // Silently fail polling
    }
  }
}));

export default useStore;
