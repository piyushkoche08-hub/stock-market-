/**
 * STOCK PREDICTOR PRO - CORE INTERFACE LOGIC
 * High-performance vanilla implementation for institutional-grade analytics.
 */

document.addEventListener('DOMContentLoaded', () => {
    // State Management
    const state = {
        ticker: new URLSearchParams(window.location.search).get('ticker') || 'RELIANCE.NS',
        interval: '1d',
        period: '1y',
        chartType: 'candlestick',
        chart: null,
        series: null,
        predictionSeries: null,
        historicalData: [],
        predictions: [],
        pollingInterval: null,
        sessionCache: {}, // Memory cache for instant switching
        searchTimeout: null,
        indicators: {
            ema: false,
            macd: false,
            rsi: true,
            volume: true
        },
        extraSeries: {
            ema20: null,
            ema50: null,
            ema200: null,
            macdLine: null,
            macdSignal: null,
            macdHist: null,
            volume: null
        },
        recentSearches: JSON.parse(localStorage.getItem('recentSearches') || '[]')
    };

    const safeEl = (id) => document.getElementById(id) || {
        innerHTML: '', textContent: '', value: '', className: '',
        classList: { add:()=>{}, remove:()=>{}, toggle:()=>{}, contains:()=>false },
        style: {},
        addEventListener: ()=>{},
        setAttribute: ()=>{},
        getAttribute: ()=>null,
        appendChild: ()=>{},
        remove: ()=>{}
    };

    // UI Elements with Safe Fallbacks
    const elements = {
        tickerInput: safeEl('ticker-input'),
        companyName: safeEl('company-name'),
        tickerSymbol: safeEl('ticker-symbol'),
        tickerInitial: safeEl('ticker-initial'),
        currentPrice: safeEl('current-price'),
        priceChange: safeEl('price-change'),
        priceChangeContainer: safeEl('price-change-container'),
        priceChangeIcon: safeEl('price-change-icon'),
        companySector: safeEl('company-sector'),
        companyIndustry: safeEl('company-industry'),
        companyDesc: safeEl('company-description'),
        marketCap: safeEl('market-cap'),
        volume: safeEl('volume'),
        wHigh52: safeEl('52w-high'),
        wLow52: safeEl('52w-low'),
        newsContainer: safeEl('news-container'),
        popularStocks: safeEl('popular-stocks-list'),
        loadingOverlay: safeEl('loading-overlay'),
        errorMsg: safeEl('error-message'),
        errorText: safeEl('error-text'),
        trendText: safeEl('market-trend-text'),
        trendIcon: safeEl('market-trend-icon'),
        trendIconBox: safeEl('market-trend-icon-container'),
        recBadge: safeEl('recommendation-badge'),
        targetPrice: safeEl('target-forecast-price'),
        confPercent: safeEl('confidence-percent'),
        confBar: safeEl('confidence-bar'),
        volatility: safeEl('volatility-level'),
        rsiSent: safeEl('rsi-sentiment'),
        searchResultsDropdown: safeEl('search-results-dropdown'),
        searchResultsContent: safeEl('search-results-content'),
        liveFeedBadge: safeEl('live-feed-badge')
    };

    const API_BASE = '/api';

    // --- UTILITIES ---

    const formatCurrency = (val, ticker = state.ticker) => {
        if (!val && val !== 0) return 'N/A';
        const isIndian = ticker.endsWith('.NS') || ticker.endsWith('.BO') || ticker.startsWith('USDINR');
        return new Intl.NumberFormat(isIndian ? 'en-IN' : 'en-US', {
            style: 'currency',
            currency: isIndian ? 'INR' : 'USD',
            maximumFractionDigits: val < 1 ? 4 : 2
        }).format(val);
    };

    const formatNumber = (val) => {
        if (!val && val !== 0) return 'N/A';
        if (val >= 1e12) return (val / 1e12).toFixed(2) + 'T';
        if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
        if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
        return new Intl.NumberFormat('en-IN').format(val);
    };

    const animateNumber = (element, targetValue, formatter) => {
        const startValue = parseFloat(element.getAttribute('data-value') || 0);
        const duration = 800;
        const startTime = performance.now();

        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOutQuad = (t) => t * (2 - t);
            const currentValue = startValue + (targetValue - startValue) * easeOutQuad(progress);
            
            element.textContent = formatter(currentValue);
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.setAttribute('data-value', targetValue);
            }
        };
        requestAnimationFrame(update);
    };

    let searchTimeout = null;
    let selectedResultIndex = -1;

    const toggleLoading = (show) => {
        if (!elements.loadingOverlay) return;
        if (show) {
            elements.loadingOverlay.classList.remove('opacity-0', 'pointer-events-none');
            elements.loadingOverlay.style.visibility = 'visible';
        } else {
            elements.loadingOverlay.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => elements.loadingOverlay.style.visibility = 'hidden', 500);
        }
    };

    const handleSearch = async (query) => {
        if (!query || query.length === 0) {
            // Show Trending and Recent when empty
            renderDefaultSearch();
            return;
        }

        elements.searchResultsDropdown.classList.remove('hidden');
        elements.searchResultsContent.innerHTML = `
            <div class="p-8 flex flex-col items-center justify-center gap-4">
                <div class="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <div class="space-y-2 w-full px-4">
                    <div class="h-4 bg-white/5 rounded-full w-3/4 animate-pulse"></div>
                    <div class="h-4 bg-white/5 rounded-full w-1/2 animate-pulse"></div>
                </div>
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Searching Global Markets...</span>
            </div>
        `;

        try {
            const res = await fetch(`${API_BASE}/search?q=${query}`);
            const data = await res.json();
            renderSearchResults(data.results, query);
        } catch (err) {
            console.error("Search failed:", err);
            elements.searchResultsContent.innerHTML = `<div class="p-4 text-center text-error text-xs">Search unavailable. Please try again.</div>`;
        }
    };

    const renderDefaultSearch = async () => {
        elements.searchResultsDropdown.classList.remove('hidden');
        
        let html = '';
        
        // 1. Recently Searched
        if (state.recentSearches.length > 0) {
            html += `
                <div class="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Recently Searched</span>
                        <button id="clear-recent" class="text-[9px] font-bold text-primary hover:underline">CLEAR ALL</button>
                    </div>
                </div>
                <div class="py-2">
                    ${state.recentSearches.slice(0, 5).map(s => `
                        <div class="search-result-item px-4 py-3 hover:bg-white/5 cursor-pointer flex items-center justify-between transition-all group" data-ticker="${s.ticker}">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-500 group-hover:text-primary transition-colors">${s.ticker.charAt(0)}</div>
                                <div>
                                    <div class="text-sm font-bold text-white group-hover:text-primary transition-colors">${s.name || s.ticker}</div>
                                    <div class="text-[10px] text-slate-500">${s.ticker}</div>
                                </div>
                            </div>
                            <span class="material-symbols-outlined text-slate-700 text-sm group-hover:text-slate-400">history</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // 2. Trending Stocks
        html += `
            <div class="px-4 py-3 border-y border-white/5 bg-white/[0.02]">
                <span class="text-[10px] font-bold text-secondary uppercase tracking-widest flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
                    Trending Global Assets
                </span>
            </div>
            <div id="trending-search-results" class="py-2">
                <div class="p-4 flex items-center justify-center"><div class="w-4 h-4 border-2 border-secondary border-t-transparent rounded-full animate-spin"></div></div>
            </div>
        `;

        elements.searchResultsContent.innerHTML = html;

        // Attach clear recent event
        const clearBtn = document.getElementById('clear-recent');
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                state.recentSearches = [];
                localStorage.removeItem('recentSearches');
                renderDefaultSearch();
            });
        }

        // Fetch Trending
        try {
            const res = await fetch(`${API_BASE}/search?q=`);
            const data = await res.json();
            if (data.trending) {
                const trendingHtml = data.trending.map(s => `
                    <div class="search-result-item px-4 py-3 hover:bg-white/5 cursor-pointer flex items-center justify-between transition-all group" data-ticker="${s.ticker}">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center text-[10px] font-black text-secondary">
                                ${s.ticker.substring(0, 2)}
                            </div>
                            <div>
                                <div class="text-sm font-bold text-white">${s.name}</div>
                                <div class="text-[10px] text-slate-500">${s.exchange} • ${s.ticker}</div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-xs font-bold text-white">${formatCurrency(s.price, s.ticker)}</div>
                            <div class="text-[10px] font-bold ${s.change >= 0 ? 'text-secondary' : 'text-error'}">${s.change >= 0 ? '+' : ''}${s.change}%</div>
                        </div>
                    </div>
                `).join('');
                const container = document.getElementById('trending-search-results');
                if (container) container.innerHTML = trendingHtml;
                
                // Re-attach click events for trending items
                container.querySelectorAll('.search-result-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const ticker = item.dataset.ticker;
                        elements.tickerInput.value = ticker;
                        elements.searchResultsDropdown.classList.add('hidden');
                        analyzeStock(ticker);
                    });
                });
            }
        } catch (e) { console.error("Trending fetch failed", e); }

        // Attach click events for recent items
        elements.searchResultsContent.querySelectorAll('.search-result-item[data-ticker]').forEach(item => {
            item.addEventListener('click', () => {
                const ticker = item.dataset.ticker;
                elements.tickerInput.value = ticker;
                elements.searchResultsDropdown.classList.add('hidden');
                analyzeStock(ticker);
            });
        });
    };

    const highlightMatch = (text, query) => {
        if (!query) return text;
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<span class="text-primary font-black underline decoration-primary/30">$1</span>');
    };

    const renderSearchResults = (results, query) => {
        if (!results || results.length === 0) {
            elements.searchResultsContent.innerHTML = `
                <div class="p-8 text-center">
                    <span class="material-symbols-outlined text-slate-700 text-4xl mb-2">search_off</span>
                    <p class="text-slate-500 text-sm">No assets found for "${query}"</p>
                </div>
            `;
            return;
        }

        elements.searchResultsContent.innerHTML = results.map((res, index) => `
            <div class="search-result-item p-4 hover:bg-white/5 cursor-pointer flex items-center justify-between transition-all border-b border-white/5 last:border-none group" 
                 data-ticker="${res.ticker}" data-name="${res.name}" data-index="${index}">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-black text-primary group-hover:bg-primary group-hover:text-white transition-all">
                        ${res.ticker.substring(0, 2)}
                    </div>
                    <div>
                        <div class="text-sm font-bold text-white group-hover:text-primary transition-colors">${highlightMatch(res.name, query)}</div>
                        <div class="text-[10px] text-slate-500 flex items-center gap-2">
                            <span class="bg-white/10 px-1.5 py-0.5 rounded text-slate-300 font-black tracking-tighter uppercase">${res.exchange}</span>
                            <span class="font-medium">${highlightMatch(res.ticker, query)}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">ANALYZE</span>
                    <span class="material-symbols-outlined text-primary text-sm">north_east</span>
                </div>
            </div>
        `).join('');

        // Attach click events
        document.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const ticker = item.dataset.ticker;
                const name = item.dataset.name;
                
                // Add to Recent
                addToRecent(ticker, name);
                
                elements.tickerInput.value = ticker;
                elements.searchResultsDropdown.classList.add('hidden');
                analyzeStock(ticker);
            });
        });

        selectedResultIndex = -1;
    };

    const handleKeyDown = (e) => {
        const items = document.querySelectorAll('.search-result-item');
        if (elements.searchResultsDropdown.classList.contains('hidden') || items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedResultIndex = Math.min(selectedResultIndex + 1, items.length - 1);
            updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedResultIndex = Math.max(selectedResultIndex - 1, 0);
            updateSelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedResultIndex >= 0) {
                items[selectedResultIndex].click();
            }
        }
    };

    const addToRecent = (ticker, name) => {
        const recent = state.recentSearches.filter(s => s.ticker !== ticker);
        recent.unshift({ ticker, name });
        state.recentSearches = recent.slice(0, 10);
        localStorage.setItem('recentSearches', JSON.stringify(state.recentSearches));
    };

    const updateSelection = (items) => {
        items.forEach((item, idx) => {
            if (idx === selectedResultIndex) {
                item.classList.add('bg-white/10');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('bg-white/10');
            }
        });
    };

    // --- CORE LOGIC ---

    const analyzeStock = async (ticker, isFullLoad = true) => {
        if (!ticker) return;
        const cleanTicker = ticker.trim().toUpperCase();
        
        // Instant Switch from Session Cache
        const cacheKey = `${cleanTicker}_${state.interval}`;
        if (state.sessionCache[cacheKey]) {
            const cachedData = state.sessionCache[cacheKey];
            state.ticker = cleanTicker;
            state.historicalData = cachedData.data;
            state.predictions = cachedData.predictions;
            updateDashboardUI(cachedData);
            renderChart(cachedData.data, cachedData.predictions);
            renderNews(cachedData.news || [], cachedData.info?.name || cleanTicker);
            if (isFullLoad) toggleLoading(false);
            return;
        }

        state.ticker = cleanTicker;
        if (isFullLoad) toggleLoading(true);
        elements.errorMsg.classList.add('hidden');

        try {
            const stockRes = await fetch(`${API_BASE}/stocks/${cleanTicker}?interval=${state.interval}`);

            if (!stockRes.ok) {
                const errorData = await stockRes.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Asset analysis failed. Please check the symbol.');
            }
            
            const stockData = await stockRes.json();
            
            // Sequential safer fetch for news
            let newsData = { news: [] };
            try {
                const newsRes = await fetch(`${API_BASE}/news/${cleanTicker}`);
                if (newsRes.ok) newsData = await newsRes.json();
            } catch (e) { console.error("Ticker news fetch failed", e); }

            // Fallback: If no ticker news, fetch general news to ensure it's never empty
            if (!newsData.news || newsData.news.length === 0) {
                try {
                    const genNewsRes = await fetch(`${API_BASE}/general-news`);
                    if (genNewsRes.ok) {
                        const genData = await genNewsRes.json();
                        newsData.news = genData.news;
                    }
                } catch (e) { console.error("General news fetch failed", e); }
            }

            // Handle Discovery Mode (Fuzzy Fallback)
            if (stockData.is_discovery) {
                elements.errorText.textContent = `Showing ${stockData.ticker} (Suggested) - '${stockData.original_search}' not found.`;
                elements.errorMsg.classList.remove('hidden', 'bg-red-500/10', 'border-red-500/20', 'text-red-400');
                elements.errorMsg.classList.add('bg-primary/10', 'border-primary/20', 'text-primary');
            } else {
                elements.errorMsg.classList.add('hidden');
            }

            state.historicalData = stockData.data;
            state.predictions = stockData.predictions;
            stockData.news = newsData.news; // Attach for session cache

            // Store in Session Cache
            state.sessionCache[cacheKey] = stockData;

            updateDashboardUI(stockData);
            renderChart(stockData.data, stockData.predictions);
            renderNews(newsData.news, stockData.info?.name || cleanTicker);

        } catch (err) {
            console.error("Analysis Failed:", err);
            elements.errorText.textContent = err.message;
            elements.errorMsg.classList.remove('hidden', 'bg-primary/10', 'border-primary/20', 'text-primary');
            elements.errorMsg.classList.add('bg-red-500/10', 'border-red-500/20', 'text-red-400');
            if (isFullLoad) toggleLoading(false);
        } finally {
            if (isFullLoad) toggleLoading(false);
        }
    };

    const updateDashboardUI = (data) => {
        const { info, ticker } = data;
        
        elements.companyName.textContent = info.name || ticker;
        elements.tickerSymbol.textContent = ticker;
        elements.tickerInitial.textContent = ticker.charAt(0);
        
        animateNumber(elements.currentPrice, info.currentPrice, (v) => formatCurrency(v, ticker));
        
        const change = info.regularMarketChangePercent || 0;
        elements.priceChange.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
        
        const isPos = change >= 0;
        elements.priceChangeContainer.className = `flex items-center px-2 py-1 rounded-lg text-sm font-bold ${isPos ? 'bg-secondary/10 text-secondary' : 'bg-error/10 text-error'}`;
        elements.priceChangeIcon.textContent = isPos ? 'arrow_upward' : 'arrow_downward';

        elements.companySector.textContent = info.sector || 'N/A';
        elements.companyIndustry.textContent = info.industry || 'N/A';
        elements.companyDesc.textContent = info.summary ? (info.summary.length > 280 ? info.summary.substring(0, 280) + '...' : info.summary) : 'Institutional profile unavailable.';

        elements.marketCap.textContent = formatNumber(info.marketCap);
        elements.volume.textContent = formatNumber(info.volume);
        elements.wHigh52.textContent = formatCurrency(info.fiftyTwoWeekHigh, ticker);
        elements.wLow52.textContent = formatCurrency(info.fiftyTwoWeekLow, ticker);

        // AI Insights
        if (elements.trendText) {
            elements.trendText.textContent = info.trend || 'Neutral';
            const trend = info.trend;
            elements.trendIcon.textContent = trend === 'Bullish' ? 'trending_up' : (trend === 'Bearish' ? 'trending_down' : 'horizontal_rule');
            elements.trendIconBox.className = `w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${trend === 'Bullish' ? 'bg-secondary/20 text-secondary' : (trend === 'Bearish' ? 'bg-error/20 text-error' : 'bg-slate-800 text-slate-500')}`;
        }

        if (elements.recBadge) {
            elements.recBadge.textContent = info.recommendation || 'WAITING...';
            const rec = info.recommendation;
            elements.recBadge.className = `px-3 py-1 rounded-md font-black text-xs uppercase tracking-tighter ${rec?.includes('Buy') ? 'bg-secondary/20 text-secondary' : (rec?.includes('Sell') ? 'bg-error/20 text-error' : 'bg-slate-800 text-slate-400')}`;
        }

        if (elements.targetPrice) elements.targetPrice.textContent = formatCurrency(info.targetPrice, ticker);
        if (elements.confPercent) elements.confPercent.textContent = `${info.confidence || 0}%`;
        if (elements.confBar) {
            elements.confBar.style.width = `${info.confidence || 0}%`;
            elements.confBar.style.backgroundColor = info.recommendation?.includes('Sell') ? '#EB5B3C' : (info.recommendation?.includes('Buy') ? '#00D09C' : '#3B82F6');
        }

        if (elements.volatility) {
            const v = Math.abs(change);
            elements.volatility.textContent = v > 3 ? 'HIGH' : (v > 1.5 ? 'MEDIUM' : 'LOW');
        }

        if (elements.rsiSent && data.data.length > 0) {
            const rsi = data.data[data.data.length - 1].RSI;
            if (rsi) {
                elements.rsiSent.textContent = rsi > 70 ? 'OVERBOUGHT' : (rsi < 30 ? 'OVERSOLD' : 'NEUTRAL');
                const rsiBox = document.getElementById('rsi-indicator-container');
                rsiBox.className = `p-3 bg-white/5 rounded-xl border ${rsi > 70 ? 'border-error/30' : (rsi < 30 ? 'border-secondary/30' : 'border-white/5')}`;
            }
        }
    };

    const renderChart = (histData, predictions) => {
        const container = document.getElementById('tv-chart-container');
        if (!container) return;

        if (!state.chart) {
            container.innerHTML = '';
            state.chart = LightweightCharts.createChart(container, {
                layout: {
                    background: { type: 'solid', color: 'transparent' },
                    textColor: '#94a3b8',
                    fontSize: 11,
                    fontFamily: 'Inter',
                },
                grid: {
                    vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
                    horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
                },
                crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
                rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
                timeScale: { borderColor: 'rgba(255, 255, 255, 0.1)', timeVisible: true },
            });

            const observer = new ResizeObserver(entries => {
                const { width, height } = entries[0].contentRect;
                state.chart.applyOptions({ width, height });
            });
            observer.observe(container);
        }

        // Clear existing series
        if (state.series) state.chart.removeSeries(state.series);
        if (state.predictionSeries) state.chart.removeSeries(state.predictionSeries);
        Object.keys(state.extraSeries).forEach(k => {
            if (state.extraSeries[k]) {
                state.chart.removeSeries(state.extraSeries[k]);
                state.extraSeries[k] = null;
            }
        });

        const isCandle = state.chartType === 'candlestick';
        
        // Main Price Series
        if (isCandle) {
            state.series = state.chart.addSeries(LightweightCharts.CandlestickSeries, {
                upColor: '#00D09C', downColor: '#EB5B3C',
                borderVisible: false, wickUpColor: '#00D09C', wickDownColor: '#EB5B3C',
            });
            const data = histData.map(d => ({
                time: Math.floor(new Date(d.Date).getTime() / 1000),
                open: parseFloat(d.Open), high: parseFloat(d.High), low: parseFloat(d.Low), close: parseFloat(d.Close),
            })).sort((a, b) => a.time - b.time);
            state.series.setData(data);
        } else {
            state.series = state.chart.addSeries(LightweightCharts.AreaSeries, {
                lineColor: '#3B82F6', topColor: 'rgba(59, 130, 246, 0.2)', bottomColor: 'rgba(59, 130, 246, 0.0)',
                lineWidth: 2,
            });
            const data = histData.map(d => ({
                time: Math.floor(new Date(d.Date).getTime() / 1000),
                value: parseFloat(d.Close),
            })).sort((a, b) => a.time - b.time);
            state.series.setData(data);
        }

        // Indicators: Volume
        if (state.indicators.volume) {
            state.extraSeries.volume = state.chart.addSeries(LightweightCharts.HistogramSeries, {
                color: '#26a69a',
                priceFormat: { type: 'volume' },
                priceScaleId: '', // Overlay on main pane
            });
            state.extraSeries.volume.priceScale().applyOptions({
                scaleMargins: { top: 0.8, bottom: 0 },
            });
            const volData = histData.map(d => ({
                time: Math.floor(new Date(d.Date).getTime() / 1000),
                value: parseFloat(d.Volume),
                color: d.Close >= d.Open ? 'rgba(0, 208, 156, 0.3)' : 'rgba(235, 91, 60, 0.3)',
            })).sort((a, b) => a.time - b.time);
            state.extraSeries.volume.setData(volData);
        }

        // Indicators: EMA
        if (state.indicators.ema) {
            state.extraSeries.ema20 = state.chart.addSeries(LightweightCharts.LineSeries, { color: '#FFD700', lineWidth: 1 });
            state.extraSeries.ema50 = state.chart.addSeries(LightweightCharts.LineSeries, { color: '#FF00FF', lineWidth: 1 });
            state.extraSeries.ema200 = state.chart.addSeries(LightweightCharts.LineSeries, { color: '#00FFFF', lineWidth: 1 });

            state.extraSeries.ema20.setData(histData.map(d => ({ time: Math.floor(new Date(d.Date).getTime() / 1000), value: d.EMA_20 })));
            state.extraSeries.ema50.setData(histData.map(d => ({ time: Math.floor(new Date(d.Date).getTime() / 1000), value: d.EMA_50 })));
            state.extraSeries.ema200.setData(histData.map(d => ({ time: Math.floor(new Date(d.Date).getTime() / 1000), value: d.EMA_200 })));
        }

        // Indicators: MACD
        if (state.indicators.macd) {
            state.extraSeries.macdHist = state.chart.addSeries(LightweightCharts.HistogramSeries, {
                priceScaleId: 'macd',
            });
            state.chart.priceScale('macd').applyOptions({
                scaleMargins: { top: 0.85, bottom: 0 },
            });
            state.extraSeries.macdHist.setData(histData.map(d => ({
                time: Math.floor(new Date(d.Date).getTime() / 1000),
                value: d.MACD_Hist,
                color: d.MACD_Hist >= 0 ? 'rgba(0, 208, 156, 0.5)' : 'rgba(235, 91, 60, 0.5)'
            })));
        }

        if (predictions?.length > 0) {
            state.predictionSeries = state.chart.addSeries(LightweightCharts.LineSeries, {
                color: '#A855F7', lineWidth: 2, lineStyle: LightweightCharts.LineStyle.Dashed,
            });
            const lastPoint = histData[histData.length - 1];
            const predData = [
                { time: Math.floor(new Date(lastPoint.Date).getTime() / 1000), value: parseFloat(lastPoint.Close) },
                ...predictions.map(p => ({
                    time: Math.floor(new Date(p.Date).getTime() / 1000),
                    value: p.Predicted_Close
                }))
            ].sort((a, b) => a.time - b.time);
            state.predictionSeries.setData(predData);
        }

        state.chart.timeScale().fitContent();
    };

    const renderNews = (news, stockName = null) => {
        if (!elements.newsContainer) return;

        // Update the header label to show which stock's news is showing
        const newsHeader = document.querySelector('#news-header-label');
        if (newsHeader) {
            if (stockName) {
                newsHeader.innerHTML = `<span class="bg-primary/10 border border-primary/20 text-primary text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest">${stockName}</span>`;
            } else {
                newsHeader.innerHTML = '';
            }
        }

        // Safety check for empty or invalid news data
        if (!news || news.length === 0) {
            elements.newsContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center p-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                    <span class="material-symbols-outlined text-slate-600 text-3xl mb-2">newspaper</span>
                    <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">No Sector Intelligence Available</p>
                    <p class="text-[10px] text-slate-600 mt-1">Global market updates will appear here live.</p>
                </div>
            `;
            return;
        }

        elements.newsContainer.innerHTML = '';
        
        news.slice(0, 8).forEach(item => {
            const div = document.createElement('div');
            div.className = 'group flex gap-4 p-4 rounded-2xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all cursor-pointer animate-fade-in';
            div.onclick = () => window.open(item.link, '_blank');
            
            const timestamp = item.providerPublishTime || item.pubDate || 0;
            let dateStr = 'Just Now';
            if (timestamp > 0) {
                const date = timestamp > 1e12 ? new Date(timestamp) : new Date(timestamp * 1000);
                const diff = (new Date() - date) / 1000;
                if (diff < 3600) dateStr = `${Math.floor(diff / 60)}m ago`;
                else if (diff < 86400) dateStr = `${Math.floor(diff / 3600)}h ago`;
                else dateStr = date.toLocaleDateString();
            }

            div.innerHTML = `
                <div class="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-slate-800">
                    <img src="${item.thumbnail || ''}" class="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" onerror="this.src='https://images.unsplash.com/photo-1611974715853-2b8ef9d1d202?auto=format&fit=crop&q=80&w=100&h=100'">
                </div>
                <div class="flex-1">
                    <h4 class="text-xs font-bold text-slate-300 line-clamp-2 group-hover:text-primary transition-colors">${item.title}</h4>
                    <div class="flex items-center gap-2 mt-2">
                        <span class="text-[9px] font-black text-slate-600 uppercase tracking-widest">${item.publisher}</span>
                        <span class="w-1 h-1 rounded-full bg-slate-700"></span>
                        <span class="text-[9px] text-slate-600">${dateStr}</span>
                    </div>
                </div>
            `;
            elements.newsContainer.appendChild(div);
        });

        // Update the 'LIVE FEED' badge to show it was refreshed
        const liveFeedBadge = elements.liveFeedBadge;
        if (liveFeedBadge) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            liveFeedBadge.innerHTML = `LIVE FEED <span class="ml-1 opacity-50 font-normal">(${timeStr})</span>`;
        }
    };

    // --- EVENTS ---

    elements.tickerInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        searchTimeout = setTimeout(() => handleSearch(query), 300);
    });

    elements.tickerInput.addEventListener('keydown', handleKeyDown);

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (!elements.tickerInput.contains(e.target) && !elements.searchResultsDropdown.contains(e.target)) {
            elements.searchResultsDropdown.classList.add('hidden');
        }
    });

    elements.tickerInput.addEventListener('focus', () => {
        if (elements.tickerInput.value.length >= 2) {
            elements.searchResultsDropdown.classList.remove('hidden');
        }
    });

    document.querySelectorAll('.interval-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.interval-btn').forEach(b => b.className = 'interval-btn px-2 py-1 text-[9px] font-bold text-slate-500 hover:text-white rounded transition-all whitespace-nowrap');
            btn.className = 'interval-btn px-2 py-1 text-[9px] font-bold bg-primary text-white rounded shadow-lg shadow-primary/20 transition-all whitespace-nowrap';
            state.interval = btn.getAttribute('data-interval');
            analyzeStock(state.ticker);
        });
    });

    // Indicator Toggles
    const setupToggle = (id, key) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                state.indicators[key] = !state.indicators[key];
                if (state.indicators[key]) {
                    btn.classList.add('bg-primary/20', 'text-primary', 'border-primary/20');
                    btn.classList.remove('text-slate-400');
                } else {
                    btn.classList.remove('bg-primary/20', 'text-primary', 'border-primary/20');
                    btn.classList.add('text-slate-400');
                }
                renderChart(state.historicalData, state.predictions);
            });
        }
    };

    setupToggle('toggle-ema', 'ema');
    setupToggle('toggle-macd', 'macd');
    setupToggle('toggle-volume', 'volume');
    setupToggle('toggle-rsi', 'rsi');

    document.getElementById('btn-line-chart').addEventListener('click', () => {
        state.chartType = 'line';
        document.getElementById('btn-line-chart').className = 'px-4 py-1.5 text-[10px] font-bold bg-primary text-white shadow-lg shadow-primary/20 rounded-md transition-all';
        document.getElementById('btn-candle-chart').className = 'px-4 py-1.5 text-[10px] font-bold text-slate-500 hover:text-white rounded-md transition-all';
        renderChart(state.historicalData, state.predictions);
    });

    document.getElementById('btn-candle-chart').addEventListener('click', () => {
        state.chartType = 'candlestick';
        document.getElementById('btn-candle-chart').className = 'px-4 py-1.5 text-[10px] font-bold bg-primary text-white shadow-lg shadow-primary/20 rounded-md transition-all';
        document.getElementById('btn-line-chart').className = 'px-4 py-1.5 text-[10px] font-bold text-slate-500 hover:text-white rounded-md transition-all';
        renderChart(state.historicalData, state.predictions);
    });

    // Popular Stocks List
    const loadPopular = async () => {
        try {
            const res = await fetch(`${API_BASE}/popular-stocks`);
            const data = await res.json();
            const allStocks = Object.values(data.stocks).flat();
            
            elements.popularStocks.innerHTML = '';
            allStocks.slice(0, 10).forEach(stock => {
                const div = document.createElement('div');
                div.className = `sidebar-item group ${state.ticker === stock.ticker ? 'active' : ''}`;
                div.innerHTML = `
                    <div class="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 group-hover:text-primary">${stock.ticker.charAt(0)}</div>
                    <div class="flex-1 flex justify-between items-center">
                        <span class="text-xs font-bold">${stock.ticker.split('.')[0]}</span>
                        <span class="material-symbols-outlined text-xs opacity-0 group-hover:opacity-100 transition-opacity">chevron_right</span>
                    </div>
                `;
                div.onclick = () => {
                    window.history.pushState({}, '', `?ticker=${stock.ticker}`);
                    analyzeStock(stock.ticker);
                };
                elements.popularStocks.appendChild(div);
            });
        } catch (e) { console.error("Could not load watchlists", e); }
    };

    // Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const icon = toggleBtn.querySelector('.material-symbols-outlined');
            icon.textContent = sidebar.classList.contains('collapsed') ? 'menu' : 'menu_open';
        });
    }

    // Initialize
    loadPopular();
    analyzeStock(state.ticker);

    // Live update for small intervals
    setInterval(() => {
        if (state.interval.includes('m') || state.interval.includes('h')) {
            analyzeStock(state.ticker, false);
        }
    }, 60000);

    // Live news refresh every 5 minutes
    setInterval(async () => {
        try {
            const newsRes = await fetch(`${API_BASE}/news/${state.ticker}`);
            let newsData = await newsRes.json();
            if (!newsData.news || newsData.news.length === 0) {
                const genNewsRes = await fetch(`${API_BASE}/general-news`);
                if (genNewsRes.ok) {
                    const genData = await genNewsRes.json();
                    newsData.news = genData.news;
                }
            }
            // Get current stock name from page
            const currentName = elements.companyName?.textContent || state.ticker;
            renderNews(newsData.news || [], currentName);
        } catch (e) { console.error("Live news update failed", e); }
    }, 300000);
});
