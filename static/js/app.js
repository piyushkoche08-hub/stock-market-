// static/js/app.js

let currentTicker = 'RELIANCE.NS';
let searchState = {
    open: false,
    activeIndex: -1,
    items: [],
    abort: null,
    cache: new Map(),
};

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    loadDashboard();
    setupEventListeners();
});

async function loadDashboard() {
    showLoader(true);
    try {
        await Promise.all([
            fetchMarketSummary().catch(e => console.error("Summary error:", e)),
            fetchTopMovers().catch(e => console.error("Movers error:", e)),
            fetchSectors().catch(e => console.error("Sectors error:", e)),
            loadStockData(currentTicker, '6mo', '1d'),
            fetchNews(currentTicker).catch(e => console.error("News error:", e))
        ]);
    } catch (error) {
        console.error("Dashboard Load Error:", error);
        alert("Failed to load dashboard data. Please check connection.");
    } finally {
        showLoader(false);
    }
}

function showLoader(show) {
    document.getElementById('loader').classList.toggle('hidden', !show);
}

function setupEventListeners() {
    // Timeframes
    document.querySelectorAll('.timeframes button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.timeframes button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const period = e.target.dataset.period;
            const interval = e.target.dataset.interval;
            loadStockData(currentTicker, period, interval);
        });
    });

    // Indicators
    document.querySelectorAll('.indicator-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget.dataset.target;
            const isActive = e.currentTarget.classList.toggle('active');
            
            if (typeof toggleIndicator === 'function') {
                toggleIndicator(target, isActive);
            }
            syncAdvancedIndicatorVisibility();
        });
    });

    // Search (universal global)
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    const resultsBox = document.getElementById('searchResults');
    const openSearchBtn = document.querySelector('.ap-search-open');

    const openSearch = () => {
        if (!resultsBox) return;
        resultsBox.classList.remove('hidden');
        searchState.open = true;
        if (searchInput) searchInput.focus();
        renderSearchEmpty();
    };

    const closeSearch = () => {
        if (!resultsBox) return;
        resultsBox.classList.add('hidden');
        searchState.open = false;
        searchState.activeIndex = -1;
    };

    if (openSearchBtn) {
        openSearchBtn.addEventListener('click', () => {
            if (searchState.open) closeSearch();
            else openSearch();
        });
    }

    // Ctrl/Cmd + K shortcut
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            openSearch();
        }
        if (e.key === 'Escape') {
            closeSearch();
        }
    });

    // Click outside closes
    document.addEventListener('click', (e) => {
        if (!resultsBox || !searchInput) return;
        const root = resultsBox.parentElement;
        if (!root) return;
        if (!root.contains(e.target)) closeSearch();
    });

    if (searchInput) {
        searchInput.addEventListener('focus', () => openSearch());
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            if (query.length === 0) {
                renderSearchEmpty();
                return;
            }
            if (query.length < 2) {
                renderSearchHint('Type at least 2 characters…');
                return;
            }
            searchTimeout = setTimeout(() => handleSearch(query), 160);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (!searchState.open) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(Math.min(searchState.items.length - 1, searchState.activeIndex + 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(Math.max(0, searchState.activeIndex - 1));
            } else if (e.key === 'Enter') {
                if (searchState.activeIndex >= 0 && searchState.items[searchState.activeIndex]) {
                    e.preventDefault();
                    selectSearchItem(searchState.items[searchState.activeIndex]);
                }
            }
        });
    }
    syncAdvancedIndicatorVisibility();
}

async function handleSearch(query) {
    try {
        const resultsBox = document.getElementById('searchResults');
        if (!resultsBox) return;

        const key = query.toUpperCase();
        if (searchState.cache.has(key)) {
            renderSearchResults(searchState.cache.get(key), query);
            return;
        }

        if (searchState.abort) searchState.abort.abort();
        searchState.abort = new AbortController();

        renderSearchHint('Searching global markets…');

        // First call: fast discovery (no quotes)
        const res = await fetch(`/api/search/v2?q=${encodeURIComponent(query)}&limit=18&offset=0&with_quotes=0`, { signal: searchState.abort.signal });
        const data = await res.json();
        const items = Array.isArray(data.results) ? data.results : [];
        searchState.cache.set(key, data);
        renderSearchResults(data, query);

        // Second call: try to hydrate top results with cached quotes (best effort)
        if (items.length > 0) {
            fetch(`/api/search/v2?q=${encodeURIComponent(query)}&limit=8&offset=0&with_quotes=1`)
                .then((r) => r.json())
                .then((d) => {
                    searchState.cache.set(key, d);
                    // Only re-render if user hasn't changed query
                    const cur = document.getElementById('searchInput')?.value?.trim() || '';
                    if (cur.toUpperCase() === key) renderSearchResults(d, query);
                })
                .catch(() => {});
        }
    } catch (e) {
        if (e?.name === 'AbortError') return;
        console.error(e);
        renderSearchHint('Search failed. Check connection.');
    }
}

function setActiveIndex(idx) {
    searchState.activeIndex = idx;
    const resultsBox = document.getElementById('searchResults');
    if (!resultsBox) return;
    [...resultsBox.querySelectorAll('.ap-sr-item')].forEach((el, i) => {
        el.classList.toggle('is-active', i === idx);
    });
}

function selectSearchItem(item) {
    currentTicker = item.symbol || item.ticker || item;
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    saveSearchHistory(currentTicker);
    document.getElementById('searchResults')?.classList.add('hidden');
    // reset timeframe to 6M
    document.querySelectorAll('.timeframes button').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-period="6mo"]')?.classList.add('active');
    loadStockData(currentTicker, '6mo', '1d');
    fetchNews(currentTicker);
}

function marketBadge(item) {
    const sym = (item.symbol || item.ticker || '').toUpperCase();
    const t = (item.marketType || item.type || item.quoteType || '').toString().toUpperCase();
    if (t.includes('CRYPTO') || sym.endsWith('-USD')) return { label: 'CRYPTO', tone: 'blue' };
    if (t.includes('FOREX') || sym.endsWith('=X')) return { label: 'FOREX', tone: 'blue' };
    if (sym.endsWith('.NS')) return { label: 'NSE', tone: 'blue' };
    if (sym.endsWith('.BO')) return { label: 'BSE', tone: 'blue' };
    if (sym.startsWith('^')) return { label: 'INDEX', tone: 'blue' };
    return { label: (item.exchange || 'GLOBAL').toString().slice(0, 10), tone: 'blue' };
}

function renderSearchEmpty() {
    const resultsBox = document.getElementById('searchResults');
    if (!resultsBox) return;
    const hist = loadSearchHistory();
    const trending = ['RELIANCE.NS', 'TCS.NS', '^NSEI', '^GSPC', 'AAPL', 'TSLA', 'NVDA', 'BTC-USD', 'USDINR=X'];

    let html = '';
    html += `<div class="ap-sr-section">History</div>`;
    if (hist.length === 0) {
        html += `<div class="ap-sr-item"><div class="ap-sr-left"><div class="ap-sr-logo">⟲</div><div class="ap-sr-meta"><div class="ap-sr-sym">No history</div><div class="ap-sr-name">Search any market to build history</div></div></div></div>`;
    } else {
        html += hist.slice(0, 8).map((s) => renderSearchRow({ symbol: s, name: 'Recent', exchange: 'HISTORY' })).join('');
    }
    html += `<div class="ap-sr-section">Trending</div>`;
    html += trending.map((s) => renderSearchRow({ symbol: s, name: 'Trending', exchange: 'TREND' })).join('');
    resultsBox.innerHTML = html;
    resultsBox.classList.remove('hidden');
    searchState.items = [...hist.slice(0, 8), ...trending].map((s) => ({ symbol: s }));
    searchState.activeIndex = -1;
}

function renderSearchHint(text) {
    const resultsBox = document.getElementById('searchResults');
    if (!resultsBox) return;
    resultsBox.innerHTML = `<div class="ap-sr-item"><div class="ap-sr-left"><div class="ap-sr-logo">…</div><div class="ap-sr-meta"><div class="ap-sr-sym">${escapeHtml(text)}</div><div class="ap-sr-name">Symbol • Company • Exchange • Market type</div></div></div></div>`;
    resultsBox.classList.remove('hidden');
    searchState.items = [];
    searchState.activeIndex = -1;
}

function renderSearchRow(item, idx) {
    const sym = item.symbol || item.ticker || '';
    const name = item.name || item.shortname || item.longname || sym;
    const badge = marketBadge(item);
    const logo = item.logoUrl ? `<img src="${escapeAttr(item.logoUrl)}" alt="" />` : `${escapeHtml(sym.slice(0,2) || 'M')}`;

    const hasQuote = typeof item.price === 'number' && isFinite(item.price);
    const chg = typeof item.changePercent === 'number' ? item.changePercent : null;
    const chgCls = chg === null ? '' : (chg >= 0 ? 'pos' : 'neg');
    const chgTxt = chg === null ? '' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;

    return `
      <div class="ap-sr-item" data-idx="${idx}">
        <div class="ap-sr-left">
          <div class="ap-sr-logo">${logo}</div>
          <div class="ap-sr-meta">
            <div class="ap-sr-sym">${escapeHtml(sym)}</div>
            <div class="ap-sr-name">${escapeHtml(name)}</div>
          </div>
        </div>
        <div class="ap-sr-right">
          <span class="ap-badge ${badge.tone}">${escapeHtml(badge.label)}</span>
          ${hasQuote ? `<div class="ap-sr-quote"><div class="ap-sr-price">${item.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:6})}</div><div class="ap-sr-chg ${chgCls}">${escapeHtml(chgTxt)}</div></div>` : ``}
        </div>
      </div>
    `;
}

function renderSearchResults(data, query) {
    const resultsBox = document.getElementById('searchResults');
    if (!resultsBox) return;
    const items = Array.isArray(data.results) ? data.results : [];
    if (items.length === 0) {
        resultsBox.innerHTML = `<div class="ap-sr-item"><div class="ap-sr-left"><div class="ap-sr-logo">0</div><div class="ap-sr-meta"><div class="ap-sr-sym">No results</div><div class="ap-sr-name">Try a symbol like RELIANCE, AAPL, BTC-USD, USDINR=X</div></div></div></div>`;
        resultsBox.classList.remove('hidden');
        searchState.items = [];
        searchState.activeIndex = -1;
        return;
    }
    let html = `<div class="ap-sr-section">Results</div>`;
    html += items.map((it, idx) => renderSearchRow(it, idx)).join('');
    resultsBox.innerHTML = html;
    resultsBox.classList.remove('hidden');
    searchState.items = items;
    searchState.activeIndex = -1;

    [...resultsBox.querySelectorAll('.ap-sr-item')].forEach((el) => {
        const idx = Number(el.getAttribute('data-idx'));
        if (!Number.isFinite(idx)) return;
        el.addEventListener('mouseenter', () => setActiveIndex(idx));
        el.addEventListener('mouseleave', () => setActiveIndex(-1));
        el.addEventListener('click', () => selectSearchItem(items[idx]));
    });
}

function loadSearchHistory() {
    try {
        const raw = localStorage.getItem('ap_search_history');
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function saveSearchHistory(symbol) {
    try {
        const sym = (symbol || '').toString().toUpperCase();
        if (!sym) return;
        const cur = loadSearchHistory();
        const next = [sym, ...cur.filter((x) => x !== sym)].slice(0, 12);
        localStorage.setItem('ap_search_history', JSON.stringify(next));
    } catch {}
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
function escapeAttr(s) {
    return escapeHtml(s).replace(/`/g, '&#096;');
}

async function loadStockData(ticker, period, interval, retries = 2) {
    try {
        showLoader(true);
        // Use explicit URL if opened via file:// or fallback to relative
        const isLocalFile = window.location.protocol === 'file:';
        const API_BASE = isLocalFile ? 'http://127.0.0.1:8000/api' : '/api';
        const apiUrl = `${API_BASE}/stocks/${ticker}?period=${period}&interval=${interval}`;
        
        console.log(`Fetching stock data from: ${apiUrl}`);
        const res = await fetch(apiUrl);
        
        if (!res.ok) {
            throw new Error(`API Error: ${res.status} ${res.statusText}`);
        }
        
        const data = await res.json();
        
        if (!data || !data.data || data.data.length === 0) {
            throw new Error('Empty or invalid data received');
        }
        
        // Update Header
        const info = data.info || {};
        const sym = info.currency === 'INR' ? '₹' : '$';
        document.getElementById('stockName').innerText = data.ticker + (info.name ? ` - ${info.name}` : '');
        
        const price = info.currentPrice || (data.data[data.data.length-1]?.Close) || 0;
        document.getElementById('stockPrice').innerText = `${sym} ${price.toFixed(2)}`;
        
        const change = info.regularMarketChangePercent || 0;
        const changeEl = document.getElementById('stockChange');
        changeEl.innerText = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
        changeEl.className = `change ${change >= 0 ? 'positive' : 'negative'}`;

        // Update AI Sidebar
        document.getElementById('aiTarget').innerText = info.targetPrice ? `${sym} ${info.targetPrice.toFixed(2)}` : '--';
        document.getElementById('aiTrend').innerText = info.trend || '--';
        document.getElementById('aiTrend').style.color = info.trend === 'Bullish' ? 'var(--success)' : (info.trend === 'Bearish' ? 'var(--danger)' : 'var(--text-muted)');
        document.getElementById('aiRec').innerText = info.recommendation || '--';

        renderAdvancedIndicators(data.data);
        renderIndicatorReadouts(data.data);
        updateChartData(data.data, data.predictions);
        showLoader(false);

    } catch (e) {
        console.error("Stock Data Error:", e);
        if (retries > 0) {
            console.log(`Retrying... (${retries} left)`);
            await new Promise(res => setTimeout(res, 1000));
            return loadStockData(ticker, period, interval, retries - 1);
        }
        showLoader(false);
        document.getElementById('stockPrice').innerText = 'Error';
        document.getElementById('stockChange').innerText = 'Failed to load stock data';
        document.getElementById('stockChange').className = 'change negative';
        // Clear chart
        if (typeof updateChartData === 'function') {
            updateChartData([], []);
        }
        renderAdvancedIndicators([]);
        renderIndicatorReadouts([]);
        alert("Failed to load stock data. Please check your network or try a different ticker.");
    }
}

function formatCompactValue(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '--';
    if (Math.abs(n) >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
    if (Math.abs(n) >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(digits);
}

function renderIndicatorReadouts(rows) {
    const last = Array.isArray(rows) && rows.length ? rows[rows.length - 1] : {};
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    set('readout-ema20', formatCompactValue(last.EMA_20));
    set('readout-ema50', formatCompactValue(last.EMA_50));
    set('readout-vwap', formatCompactValue(last.VWAP));
    set('readout-bb', last.Upper_BB && last.Lower_BB ? `${formatCompactValue(last.Upper_BB)} / ${formatCompactValue(last.Lower_BB)}` : '--');
    set('readout-vol', formatCompactValue(last.Volume, 0));
    set('readout-ai', last.RF_Confidence !== undefined ? `${formatCompactValue(last.RF_Confidence)}%` : '--');
    set('readout-breakoutProb', last.Breakout_Prob !== undefined ? `${formatCompactValue(last.Breakout_Prob)}%` : '--');
    set('readout-strategyZP', last.ZP_Strategy_Signal === 1 ? 'BUY' : last.ZP_Strategy_Signal === -1 ? 'SELL' : 'WAIT');
}

function syncAdvancedIndicatorVisibility() {
    const breakoutActive = document.querySelector('.indicator-toggle[data-target="breakoutProb"]')?.classList.contains('active');
    const strategyActive = document.querySelector('.indicator-toggle[data-target="strategyZP"]')?.classList.contains('active');
    const breakoutCard = document.getElementById('breakoutCard');
    const zpCard = document.getElementById('zpCard');
    if (breakoutCard) breakoutCard.classList.toggle('is-muted', !breakoutActive);
    if (zpCard) zpCard.classList.toggle('is-muted', !strategyActive);
}

function renderAdvancedIndicators(rows) {
    const last = Array.isArray(rows) && rows.length ? rows[rows.length - 1] : {};
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    const setClass = (id, className) => {
        const el = document.getElementById(id);
        if (el) el.className = className;
    };

    if (!rows || rows.length === 0) {
        setText('breakoutValue', '--%');
        setText('breakoutStatus', 'Waiting');
        setText('breakoutInsight', 'Waiting for chart data...');
        const meter = document.getElementById('breakoutMeter');
        if (meter) meter.style.width = '0%';
        setText('zpTrend', 'Trend --');
        setText('zpMomentum', 'Momentum --');
        setText('zpVolume', 'Volume --');
        setText('zpVerdict', 'NEUTRAL');
        setText('zpStrength', '--%');
        return;
    }

    const breakoutProb = Number(last.Breakout_Prob || 0);
    const breakoutStatus = breakoutProb >= 70 ? 'High' : breakoutProb >= 40 ? 'Moderate' : 'Low';
    setText('breakoutValue', `${breakoutProb.toFixed(2)}%`);
    setText('breakoutStatus', breakoutStatus);
    setText('breakoutInsight', breakoutProb >= 70
        ? 'Squeeze, range pressure, and volume expansion are lining up.'
        : breakoutProb >= 40
            ? 'Breakout conditions are forming. Watch confirmation.'
            : 'Range pressure is contained right now.'
    );
    const meter = document.getElementById('breakoutMeter');
    if (meter) meter.style.width = `${Math.max(0, Math.min(100, breakoutProb))}%`;

    const signal = Number(last.ZP_Strategy_Signal || 0);
    const strength = Number(last.ZP_Strategy_Strength || 0);
    const trendUp = last.Close > last.EMA_20 && last.EMA_20 > last.EMA_50;
    const trendDown = last.Close < last.EMA_20 && last.EMA_20 < last.EMA_50;
    const momUp = last.RSI > 60;
    const momDown = last.RSI < 40;
    const recent = rows.slice(-20).filter((row) => Number.isFinite(Number(row.Volume)));
    const avgVolume = recent.length ? recent.reduce((sum, row) => sum + Number(row.Volume), 0) / recent.length : 0;
    const volumeHot = avgVolume > 0 && Number(last.Volume || 0) / avgVolume > 1.1;

    setText('zpTrend', `Trend ${trendUp ? 'UP' : trendDown ? 'DOWN' : 'FLAT'}`);
    setText('zpMomentum', `Momentum ${momUp ? 'BULL' : momDown ? 'BEAR' : 'MID'}`);
    setText('zpVolume', `Volume ${volumeHot ? 'CONFIRMED' : 'NORMAL'}`);
    setClass('zpTrend', `zp-factor ${trendUp ? 'is-positive' : trendDown ? 'is-negative' : ''}`);
    setClass('zpMomentum', `zp-factor ${momUp ? 'is-positive' : momDown ? 'is-negative' : ''}`);
    setClass('zpVolume', `zp-factor span-2 ${volumeHot ? 'is-volume' : ''}`);
    setText('zpVerdict', signal === 1 ? 'STRONG BUY' : signal === -1 ? 'STRONG SELL' : 'NEUTRAL / WAIT');
    setText('zpStrength', `${strength.toFixed(2)}%`);
    setClass('zpVerdict', signal === 1 ? 'is-buy' : signal === -1 ? 'is-sell' : 'is-neutral');
}

function formatMarketSummaryPrice(price, currency) {
    const cur = currency || 'USD';
    try {
        return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : undefined, {
            style: 'currency',
            currency: cur,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(Number(price));
    } catch {
        return String(price ?? '');
    }
}

async function fetchMarketSummary() {
    try {
        const isLocalFile = window.location.protocol === 'file:';
        const baseUrl = isLocalFile ? 'http://127.0.0.1:8000' : '';
        const res = await fetch(`${baseUrl}/api/market-summary`);
        const payload = await res.json();
        const data = payload.summary || [];
        const container = document.getElementById('marketSummary');
        if (!container) return;
        container.innerHTML = '';
        
        if (data && Array.isArray(data)) {
            data.forEach((m, idx) => {
                const isPos = m.changePercent >= 0;
                
                const tr = document.createElement('tr');
                tr.className = 'market-row';
                tr.innerHTML = `
                    <td>
                        <div class="market-info">
                            <span class="name">${m.name}</span>
                            <span class="symbol">${m.symbol}</span>
                        </div>
                    </td>
                    <td>
                        <div class="price-info">
                            <span class="price">${formatMarketSummaryPrice(m.price, m.currency)}</span>
                            <span class="currency">${m.currency}</span>
                        </div>
                    </td>
                    <td>
                        <div class="change-info ${isPos ? 'positive' : 'negative'}">
                            <span class="pct">${isPos ? '+' : ''}${m.changePercent.toFixed(2)}%</span>
                            <span class="label">Today</span>
                        </div>
                    </td>
                    <td style="text-align: center;">
                        <div class="spark-container">
                            ${renderSparklineSVG(m.sparkline, isPos)}
                        </div>
                    </td>
                    <td style="text-align: right;">
                        <button class="analyze-btn" onclick="window.location.href='/markets'">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </button>
                    </td>
                `;
                container.appendChild(tr);
            });
        }
    } catch (e) {
        console.error(e);
    }
}

function renderSparklineSVG(data, isPositive) {
    if (!data || data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((d, i) => ({
      x: (i / (data.length - 1)) * 100,
      y: 32 - ((d - min) / range) * 28
    }));
    const path = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
    const color = isPositive ? '#10b981' : '#ef4444';
    
    return `
      <svg viewBox="0 0 100 32" style="width: 100px; height: 32px; overflow: visible;">
        <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
}

async function fetchTopMovers() {
    try {
        const res = await fetch('/api/top-movers');
        const data = await res.json();
        
        const renderMovers = (list, elementId) => {
            const container = document.getElementById(elementId);
            container.innerHTML = '';
            if (list && list.length > 0) {
                list.forEach(item => {
                    const isPos = item.change >= 0;
                    const el = document.createElement('div');
                    el.className = 'mover-item';
                    el.innerHTML = `
                        <div class="mover-name">${item.ticker}</div>
                        <div class="mover-price">
                            <div>${item.price.toFixed(2)}</div>
                            <div class="change ${isPos ? 'positive' : 'negative'}" style="font-size: 0.8rem;">
                                ${isPos ? '+' : ''}${item.change.toFixed(2)}%
                            </div>
                        </div>
                    `;
                    el.onclick = () => {
                        currentTicker = item.ticker;
                        document.querySelector('.timeframes button[data-period="6mo"]').click();
                        fetchNews(currentTicker);
                    };
                    container.appendChild(el);
                });
            } else {
                const empty = document.createElement('div');
                empty.className = 'mover-item';
                empty.style.opacity = '0.8';
                empty.innerHTML = `<div class="mover-name">No data</div><div class="mover-price" style="color: var(--text-muted); font-size: 0.85rem;">—</div>`;
                container.appendChild(empty);
            }
        };
        
        renderMovers(data.gainers, 'topGainers');
        renderMovers(data.losers, 'topLosers');
    } catch (e) {
        console.error(e);
    }
}

async function fetchSectors() {
    try {
        const res = await fetch('/api/sectors');
        const data = await res.json();
        const container = document.getElementById('sectorsList');
        container.innerHTML = '';
        
        if (data.sectors && data.sectors.length > 0) {
            data.sectors.forEach(s => {
                const isPos = s.change >= 0;
                const el = document.createElement('div');
                el.className = 'mover-item';
                el.innerHTML = `
                    <div class="mover-name">${s.name.replace('NIFTY ', '')}</div>
                    <div class="mover-price change ${isPos ? 'positive' : 'negative'}">
                        ${isPos ? '+' : ''}${s.change.toFixed(2)}%
                    </div>
                `;
                container.appendChild(el);
            });
        } else {
            const empty = document.createElement('div');
            empty.className = 'mover-item';
            empty.style.opacity = '0.8';
            empty.innerHTML = `<div class="mover-name">No sector data</div><div class="mover-price" style="color: var(--text-muted); font-size: 0.85rem;">—</div>`;
            container.appendChild(empty);
        }
    } catch (e) {
        console.error(e);
    }
}

async function fetchNews(ticker) {
    try {
        const res = await fetch(`/api/news/${ticker}`);
        const data = await res.json();
        const container = document.getElementById('newsGrid');
        container.innerHTML = '';
        
        if (data.news && data.news.length > 0) {
            data.news.forEach(n => {
                const date = new Date(n.providerPublishTime * 1000).toLocaleString();
                const initials = (n.publisher || 'N').substring(0, 2).toUpperCase();
                const card = document.createElement('a');
                card.href = n.link;
                card.target = '_blank';
                card.className = 'glass news-card';
                card.innerHTML = `
                    <div style="display:flex; gap: 1rem; align-items: flex-start;">
                        <div style="flex-shrink:0; width:40px; height:40px; border-radius:8px; background:rgba(59,130,246,0.12); border:1px solid rgba(59,130,246,0.2); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:900; color:#60a5fa; letter-spacing:0.05em;">
                            ${initials}
                        </div>
                        <div style="flex:1;">
                            <div class="news-source" style="margin-bottom: 4px;">${n.publisher}</div>
                            <div class="news-title" style="font-size: 14px; margin-bottom: 4px;">${n.title}</div>
                            <div class="news-time">${date}</div>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        } else {
            container.innerHTML = '<p>No news available for this asset.</p>';
        }
    } catch (e) {
        console.error(e);
    }
}
