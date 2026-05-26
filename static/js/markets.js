const isLocalFile = window.location.protocol === 'file:';
const API_BASE = isLocalFile ? 'http://127.0.0.1:8000/api' : '/api';
const ROOT_API_BASE = isLocalFile ? 'http://127.0.0.1:8000' : '';

const formatCurrency = (val, currency = 'INR', isIndex = false) => {
    if(!val && val !== 0) return '-';
    if (isIndex) {
        return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
    }
    const isCrypto = currency === 'USD' && val < 1;
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { 
        style: 'currency', 
        currency: currency,
        minimumFractionDigits: isCrypto ? 4 : 2,
        maximumFractionDigits: isCrypto ? 6 : 2
    }).format(val);
};

const formatNumber = (val) => {
    if(!val && val !== 0) return '-';
    if(val >= 10000000) return (val / 10000000).toFixed(2) + ' Cr';
    if(val >= 100000) return (val / 100000).toFixed(2) + ' L';
    if(val >= 1000) return (val / 1000).toFixed(2) + ' K';
    return val.toLocaleString('en-IN');
};

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatMoverPriceSafe(price, currency) {
    const n = Number(price);
    if (!Number.isFinite(n)) return '—';
    try {
        return formatCurrency(n, currency);
    } catch {
        return currency === 'INR'
            ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

function formatChangePctSafe(stock) {
    const c = Number(stock.change);
    if (!Number.isFinite(c)) return '—';
    return `${c >= 0 ? '+' : ''}${c.toFixed(2)}%`;
}

let currentCategory = 'Indian Market';
let currentCategoryAssets = [];
let moversCache = null;

function isIndianTicker(t) {
    return /\.(NS|BO)$/i.test(t || '');
}

function currencyForMoverTicker(t) {
    const s = t || '';
    if (isIndianTicker(s)) return 'INR';
    if (/^USDINR/i.test(s) || /^EURINR/i.test(s)) return 'INR';
    return 'USD';
}

function filterMoversByCategory(stocks, cat) {
    if (!stocks || !stocks.length) return [];
    if (cat === 'Indian Market') {
        return stocks.filter((s) => isIndianTicker(s.ticker));
    }
    if (cat === 'US Market') {
        return stocks.filter(
            (s) =>
                !isIndianTicker(s.ticker) &&
                !/=X$/i.test(s.ticker) &&
                !/-USD$/i.test(s.ticker)
        );
    }
    if (cat === 'Forex') {
        return stocks.filter((s) => /=X$/i.test(s.ticker));
    }
    if (cat === 'Crypto' || cat === 'Meme Coins') {
        return stocks.filter((s) => /-USD$/i.test(s.ticker));
    }
    return stocks;
}

function renderCategoryAssets(assets, cat) {
    const body = document.getElementById('category-assets-body');
    if (!body) return;
    body.innerHTML = '';

    if (!assets || assets.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="p-12 text-center text-slate-500">No assets found for this search.</td></tr>';
        return;
    }

    assets.forEach(asset => {
        const isPositive = asset.change >= 0;
        const colorClass = isPositive ? 'text-secondary' : 'text-error';
        const tr = document.createElement('tr');
        tr.className = 'asset-row transition-all cursor-pointer group';
        tr.onclick = () => window.location.href = `index.html?ticker=${asset.ticker}`;
        
        let currency = 'USD';
        if (cat === 'Indian Market' || asset.ticker.endsWith('.NS') || asset.ticker.endsWith('.BO')) {
            currency = 'INR';
        } else if (cat === 'Forex' && asset.ticker.startsWith('USDINR')) {
            currency = 'INR';
        } else if (cat === 'Crypto' || cat === 'Meme Coins') {
            currency = 'USD';
        }
        
        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="flex flex-col">
                    <span class="font-bold text-white group-hover:text-blue-400 transition-colors">${asset.ticker.replace('.NS', '').replace('=X', '')}</span>
                    <span class="text-[10px] text-slate-500 uppercase font-medium line-clamp-1">${asset.name}</span>
                </div>
            </td>
            <td class="px-6 py-4 font-bold text-slate-300">${formatCurrency(asset.price, currency)}</td>
            <td class="px-6 py-4 text-right ${colorClass} font-black">${isPositive ? '+' : ''}${asset.change.toFixed(2)}%</td>
            <td class="px-6 py-4 text-right text-slate-500 text-xs">${formatNumber(asset.volume)}</td>
            <td class="px-6 py-4 text-right">
                <button class="text-blue-500 hover:text-blue-400 transition-all active:scale-90"><span class="material-symbols-outlined">add_circle</span></button>
            </td>
        `;
        body.appendChild(tr);
    });
}

function applyAssetsSearch() {
    const searchInput = document.getElementById('assets-search-input');
    const query = (searchInput?.value || '').trim().toLowerCase();

    if (!query) {
        renderCategoryAssets(currentCategoryAssets, currentCategory);
        return;
    }

    const filteredAssets = currentCategoryAssets.filter(asset =>
        asset.ticker.toLowerCase().includes(query) ||
        (asset.name || '').toLowerCase().includes(query)
    );
    renderCategoryAssets(filteredAssets, currentCategory);
}

    async function renderSparkline(canvasId, ticker, colorHex) {
        try {
            const res = await fetch(`${API_BASE}/stocks/${ticker}?interval=1h&period=5d`);
            if (!res.ok) return;
            const data = await res.json();
            if (!data.data || data.data.length === 0) return;
            
            const closePrices = data.data.slice(-24).map(d => d.Close);
            const labels = data.data.slice(-24).map(d => d.Date);

            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            
            // Clear existing chart if any
            const existingChart = Chart.getChart(canvas);
            if (existingChart) existingChart.destroy();
            
            new Chart(ctx, {

            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: closePrices,
                    borderColor: colorHex,
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    fill: true,
                    backgroundColor: (context) => {
                        const gradient = context.chart.ctx.createLinearGradient(0, 0, 0, 50);
                        gradient.addColorStop(0, colorHex + '33');
                        gradient.addColorStop(1, 'transparent');
                        return gradient;
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false } },
                layout: { padding: { top: 5, bottom: 5 } }
            }
        });
    } catch (e) { console.error("Error sparkline:", e); }
}

async function loadMarketIndices() {
    try {
        const res = await fetch(`${ROOT_API_BASE}/index`);
        const data = await res.json();
        const container = document.getElementById('top-indices-table-body');
        if (!container) return;
        container.innerHTML = '';

        const indicesToShow = [
            { symbol: '^NSEI', name: 'NIFTY 50' },
            { symbol: '^BSESN', name: 'SENSEX' },
            { symbol: '^IXIC', name: 'NASDAQ Composite' },
            { symbol: '^GSPC', name: 'S&P 500' },
            { symbol: '^FTSE', name: 'FTSE 100' }
        ];

        const indianIndexSymbols = new Set(['^NSEI', '^BSESN']);
        indicesToShow.forEach(idx => {
            const item = data.find(i => i.symbol === idx.symbol) || {
                symbol: idx.symbol,
                name: idx.name,
                price: 0,
                changePercent: 0,
                currency: indianIndexSymbols.has(idx.symbol) ? 'INR' : 'USD',
            };
            
            const isPositive = item.changePercent >= 0;
            const colorClass = isPositive ? 'text-secondary' : 'text-error';
            const colorHex = isPositive ? '#00D09C' : '#ef4444';
            const canvasId = `top-chart-${item.symbol.replace('^', '').replace('=', '')}`;

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-white/2 transition-all cursor-pointer group border-b border-white/5 last:border-0';
            tr.innerHTML = `
                <td class="px-8 py-5">
                    <div class="flex items-center gap-4">
                        <div class="w-8 h-8 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center text-[10px] font-black text-slate-500 group-hover:text-blue-400 transition-colors" style="line-height:1;">
                            <span style="line-height:1; display:inline-flex; align-items:center; justify-content:center; width:100%; height:100%;">${idx.name.charAt(0)}</span>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs font-black text-white group-hover:text-blue-400 transition-colors tracking-tight">${idx.name}</span>
                            <span class="text-[9px] text-slate-600 font-mono font-bold uppercase">${item.symbol}</span>
                        </div>
                    </div>
                </td>
                <td class="px-8 py-5 font-mono text-xs font-black text-white">
                    ${formatCurrency(item.price, item.currency, false)}
                </td>
                <td class="px-8 py-5">
                    <div class="flex flex-col">
                        <div class="flex items-center gap-1 text-xs font-black ${colorClass}">
                            <span class="material-symbols-outlined text-xs">${isPositive ? 'trending_up' : 'trending_down'}</span>
                            ${isPositive ? '+' : ''}${item.changePercent.toFixed(2)}%
                        </div>
                        <span class="text-[9px] text-slate-600 font-bold">Today's Shift</span>
                    </div>
                </td>
                <td class="px-8 py-5">
                    <div class="w-32 h-10 mx-auto opacity-80" style="width: 120px; height: 40px;">
                        <canvas id="${canvasId}"></canvas>
                    </div>
                </td>
                <td class="px-8 py-5 text-right">
                    <button class="px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white text-[10px] font-black uppercase tracking-widest rounded-lg border border-blue-500/20 transition-all active:scale-95">Analyze</button>
                </td>
            `;
            container.appendChild(tr);
            renderSparkline(canvasId, item.symbol, colorHex);
        });
    } catch (e) { console.error("Indices error:", e); }
}

async function switchCategory(cat) {
    currentCategory = cat;
    // Update Tabs
    ['Indian Market', 'US Market', 'Forex', 'Crypto', 'Meme Coins'].forEach(c => {
        const btn = document.getElementById(`cat-${c}`);
        if(c === cat) {
            btn.className = 'tab-btn tab-active';
        } else {
            btn.className = 'tab-btn';
        }
    });

    // Update Headers
    document.getElementById('explorer-title').textContent = `${cat} Assets`;
    document.getElementById('explorer-desc').textContent = `Live tracking for ${cat} across major exchanges`;
    document.getElementById('news-title').textContent = `${cat} Updates`;
    const searchInput = document.getElementById('assets-search-input');
    if (searchInput) searchInput.value = '';

    loadCategoryAssets(cat);
    loadGeneralNews(cat);
    renderTopMoversPanel();
}

async function loadCategoryAssets(cat) {
    const body = document.getElementById('category-assets-body');
    if (body) {
        const skeletonRow = `
            <tr class="animate-pulse border-b border-white/5">
                <td class="px-6 py-4">
                    <div class="flex flex-col gap-2">
                        <div class="h-4 bg-slate-700/50 rounded w-20"></div>
                        <div class="h-3 bg-slate-800/50 rounded w-32"></div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="h-4 bg-slate-700/50 rounded w-24"></div>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="h-4 bg-slate-700/50 rounded w-16 inline-block"></div>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="h-4 bg-slate-700/50 rounded w-20 inline-block"></div>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="h-6 w-6 bg-slate-700/50 rounded-full inline-block"></div>
                </td>
            </tr>`;
        body.innerHTML = Array(6).fill(skeletonRow).join('');
    }
    
    try {
        const res = await fetch(`${API_BASE}/market-category/${encodeURIComponent(cat)}`);
        const data = await res.json();
        if (!body) return;

        if (!data.assets || data.assets.length === 0) {
            body.innerHTML = '<tr><td colspan="5" class="p-12 text-center text-slate-500">No assets found for this category.</td></tr>';
            currentCategoryAssets = [];
            return;
        }
        currentCategoryAssets = data.assets;
        applyAssetsSearch();
    } catch (e) { console.error("Category error:", e); }
}

async function loadGeneralNews(cat = null) {
    try {
        const url = cat ? `${API_BASE}/general-news?category=${encodeURIComponent(cat)}` : `${API_BASE}/general-news`;
        const res = await fetch(url);
        const data = await res.json();
        const container = document.getElementById('news-container');
        if (!container) return;
        container.innerHTML = '';

        data.news.forEach(article => {
            let timeStr = 'Recent';
            if (article.providerPublishTime) {
                const date = new Date(article.providerPublishTime * 1000);
                if (!isNaN(date.getTime())) {
                    timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                }
            }
            const initials = (article.publisher || 'N').substring(0, 2).toUpperCase();
            const div = document.createElement('a');
            div.href = article.link;
            div.target = "_blank";
            div.className = 'news-item';
            div.innerHTML = `
                <div style="display:flex; gap: 0.75rem; align-items: flex-start; padding: 0.875rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); text-decoration: none; transition: background 0.2s;">
                    <div style="flex-shrink:0; width:36px; height:36px; border-radius:8px; background:rgba(59,130,246,0.12); border:1px solid rgba(59,130,246,0.2); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:900; color:#60a5fa; letter-spacing:0.05em;">
                        ${initials}
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <span style="font-size:9px; font-weight:900; color:#3b82f6; text-transform:uppercase; letter-spacing:0.1em;">${article.publisher || ''}</span>
                            <span style="font-size:9px; color:#475569; font-weight:600;">${timeStr}</span>
                        </div>
                        <h4 style="font-size:12px; font-weight:700; color:#cbd5e1; line-height:1.4; margin:0 0 4px 0; display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${article.title}</h4>
                        <p style="font-size:11px; color:#475569; margin:0; display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.5;">${article.summary || ''}</p>
                    </div>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (e) { console.error("News error:", e); }
}


function renderTopMoversPanel() {
    const container = document.getElementById('movers-mini-list');
    if (!container || !moversCache) return;

    let rows = [...(moversCache.gainers || [])];
    rows = filterMoversByCategory(rows, currentCategory);
    rows.sort((a, b) => b.change - a.change);
    rows = rows.slice(0, 5);

    container.innerHTML = '';

    if (rows.length === 0) {
        container.innerHTML =
            '<div class="movers-mini-card text-center text-xs text-slate-500 py-8">No top movers for this market right now.</div>';
        return;
    }

    rows.forEach((stock) => {
        const chg = Number(stock.change);
        const isPositive = Number.isFinite(chg) ? chg >= 0 : true;
        const currency = currencyForMoverTicker(stock.ticker);
        const sym = String(stock.ticker || '')
            .replace(/\.NS$/i, '')
            .replace(/\.BO$/i, '')
            .replace(/=X$/i, '');
        const div = document.createElement('div');
        div.className = 'movers-mini-card';
        div.onclick = () => (window.location.href = `index.html?ticker=${stock.ticker}`);
        div.innerHTML = `
                <div class="movers-mini-left">
                    <span class="movers-mini-symbol">${escapeHtml(sym)}</span>
                    <span class="movers-mini-name">${escapeHtml(stock.name || '')}</span>
                </div>
                <div class="movers-mini-right">
                    <div class="movers-mini-price">${formatMoverPriceSafe(stock.price, currency)}</div>
                    <div class="movers-mini-pct ${isPositive ? 'up' : 'down'}">${formatChangePctSafe(stock)}</div>
                </div>
            `;
        container.appendChild(div);
    });
}

async function loadTopMovers() {
    try {
        const res = await fetch(`${API_BASE}/top-movers`);
        moversCache = await res.json();
        renderTopMoversPanel();
    } catch (e) {
        console.error('Movers error:', e);
    }
}

async function loadSectors() {
    try {
        const res = await fetch(`${API_BASE}/sectors`);
        const data = await res.json();
        const container = document.getElementById('sector-mini-grid');
        if (!container) return;

        if (!data.sectors || data.sectors.length === 0) {
            container.innerHTML =
                '<div class="p-6 text-xs text-slate-400 font-semibold text-center">Sector data is currently unavailable.</div>';
            return;
        }

        const tbody = document.createElement('tbody');
        data.sectors.forEach((sector) => {
            const isPositive = sector.change >= 0;
            const pctClass = isPositive ? 'text-secondary' : 'text-error';
            const icon = isPositive ? 'trending_up' : 'trending_down';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="sector-name-cell">
                    <div>${sector.name}</div>
                </td>
                <td class="text-right whitespace-nowrap">
                    <span class="text-sm font-black ${pctClass}">${isPositive ? '+' : ''}${sector.change.toFixed(2)}%</span>
                </td>
                <td class="text-right w-12">
                    <span class="material-symbols-outlined text-lg ${pctClass}" aria-hidden="true">${icon}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });

        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th scope="col">Sector</th>
                        <th scope="col" class="text-right">1D %</th>
                        <th scope="col" class="text-right w-12">Trend</th>
                    </tr>
                </thead>
            </table>
        `;
        container.querySelector('table').appendChild(tbody);
    } catch (e) {
        console.error('Sectors error:', e);
    }
}


document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('assets-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', applyAssetsSearch);
    }

    loadMarketIndices();
    await loadTopMovers();
    switchCategory('Indian Market');
    loadSectors();

    setInterval(() => {
        loadMarketIndices();
        loadTopMovers();
        loadCategoryAssets(currentCategory);
        loadGeneralNews(currentCategory);
    }, 60000); // 1 minute
});
