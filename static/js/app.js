// static/js/app.js

let currentTicker = 'RELIANCE.NS';

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
            const target = e.target.dataset.target;
            const isActive = e.target.classList.toggle('active');
            
            if (typeof toggleIndicator === 'function') {
                toggleIndicator(target, isActive);
            }
        });
    });

    // Search
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length < 2) {
            document.getElementById('searchResults').classList.add('hidden');
            return;
        }
        searchTimeout = setTimeout(() => handleSearch(query), 300);
    });
}

async function handleSearch(query) {
    try {
        const res = await fetch(`/api/search?q=${query}`);
        const data = await res.json();
        const resultsBox = document.getElementById('searchResults');
        resultsBox.innerHTML = '';
        
        if (data.results && data.results.length > 0) {
            data.results.forEach(item => {
                const div = document.createElement('div');
                div.className = 'mover-item';
                div.style.marginBottom = '0.5rem';
                div.innerHTML = `<div><strong>${item.ticker}</strong><br><small>${item.name}</small></div><div>${item.exchange}</div>`;
                div.onclick = () => {
                    currentTicker = item.ticker;
                    document.getElementById('searchInput').value = '';
                    resultsBox.classList.add('hidden');
                    // reset timeframe to 6M
                    document.querySelectorAll('.timeframes button').forEach(b => b.classList.remove('active'));
                    document.querySelector('[data-period="6mo"]').classList.add('active');
                    loadStockData(currentTicker, '6mo', '1d');
                    fetchNews(currentTicker);
                };
                resultsBox.appendChild(div);
            });
            resultsBox.classList.remove('hidden');
        } else {
            resultsBox.innerHTML = '<div style="padding: 1rem; color: #94a3b8;">No results found</div>';
            resultsBox.classList.remove('hidden');
        }
    } catch (e) {
        console.error(e);
    }
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
        alert("Failed to load stock data. Please check your network or try a different ticker.");
    }
}

async function fetchMarketSummary() {
    try {
        const isLocalFile = window.location.protocol === 'file:';
        const baseUrl = isLocalFile ? 'http://127.0.0.1:8000' : '';
        const res = await fetch(`${baseUrl}/index`);
        const data = await res.json();
        const container = document.getElementById('marketSummary');
        if (!container) return;
        container.innerHTML = '';
        
        if (data && Array.isArray(data)) {
            data.forEach((m, idx) => {
                const sym = m.currency === 'INR' ? '₹' : (m.currency === 'USD' ? '$' : '');
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
                            <span class="price">${sym}${m.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
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
            if (list) {
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
        
        if (data.sectors) {
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
                const card = document.createElement('a');
                card.href = n.link;
                card.target = '_blank';
                card.className = 'glass news-card';
                card.innerHTML = `
                    <div class="news-source">${n.publisher}</div>
                    <div class="news-title">${n.title}</div>
                    <div class="news-time">${date}</div>
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
