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

let currentCategory = 'Indian Market';

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

        indicesToShow.forEach(idx => {
            const item = data.find(i => i.symbol === idx.symbol) || {
                symbol: idx.symbol, name: idx.name, price: 0, changePercent: 0, currency: idx.symbol.includes('^NSE') ? 'INR' : 'USD'
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
                        <div class="w-8 h-8 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center text-[10px] font-black text-slate-500 group-hover:text-blue-400 transition-colors">
                            ${idx.name.charAt(0)}
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs font-black text-white group-hover:text-blue-400 transition-colors tracking-tight">${idx.name}</span>
                            <span class="text-[9px] text-slate-600 font-mono font-bold uppercase">${item.symbol}</span>
                        </div>
                    </div>
                </td>
                <td class="px-8 py-5 font-mono text-xs font-black text-white">
                    ${formatCurrency(item.price, item.currency, true)}
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
            btn.className = 'px-4 py-2 text-xs font-bold bg-blue-500 text-white rounded-lg transition-all whitespace-nowrap';
        } else {
            btn.className = 'px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 rounded-lg transition-all whitespace-nowrap';
        }
    });

    // Update Headers
    document.getElementById('explorer-title').textContent = `${cat} Market Assets`;
    document.getElementById('explorer-desc').textContent = `Live tracking for ${cat} across major exchanges`;
    document.getElementById('news-title').textContent = `${cat} Updates`;

    loadCategoryAssets(cat);
    loadGeneralNews(cat);
}

async function loadCategoryAssets(cat) {
    const body = document.getElementById('category-assets-body');
    if (body) body.innerHTML = '<tr><td colspan="5" class="p-12 text-center"><div class="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div><span class="text-xs font-bold text-slate-500">UPDATING MARKET...</span></td></tr>';
    
    try {
        const res = await fetch(`${API_BASE}/market-category/${encodeURIComponent(cat)}`);
        const data = await res.json();
        if (!body) return;
        body.innerHTML = '';

        if (!data.assets || data.assets.length === 0) {
            body.innerHTML = '<tr><td colspan="5" class="p-12 text-center text-slate-500">No assets found for this category.</td></tr>';
            return;
        }

        data.assets.forEach(asset => {
            const isPositive = asset.change >= 0;
            const colorClass = isPositive ? 'text-secondary' : 'text-error';
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-white/5 transition-colors cursor-pointer group';
            tr.onclick = () => window.location.href = `index.html?ticker=${asset.ticker}`;
            
            // Smarter currency detection
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
            const div = document.createElement('a');
            div.href = article.link;
            div.target = "_blank";
            div.className = 'p-6 hover:bg-white/5 transition-all flex gap-4 group block border-b border-white/5 last:border-0';
            div.innerHTML = `
                ${article.thumbnail ? `<img src="${article.thumbnail}" class="w-16 h-16 rounded-lg object-cover bg-slate-800 shrink-0 border border-white/10 shadow-lg" />` : 
                `<div class="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-white/10"><span class="material-symbols-outlined text-slate-600 text-sm">news</span></div>`}
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-[10px] font-black text-blue-500 uppercase tracking-widest">${article.publisher}</span>
                        <span class="text-[9px] font-medium text-slate-500">${timeStr}</span>
                    </div>
                    <h4 class="text-sm font-bold text-slate-200 leading-tight group-hover:text-blue-400 transition-colors line-clamp-2">${article.title}</h4>
                    <p class="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed font-medium">${article.summary || ''}</p>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (e) { console.error("News error:", e); }
}


async function loadTopMovers() {
    try {
        const res = await fetch(`${API_BASE}/top-movers`);
        const data = await res.json();
        const container = document.getElementById('movers-mini-list');
        if (!container) return;
        container.innerHTML = '';

        data.gainers.slice(0, 5).forEach(stock => {
            const isPositive = stock.change >= 0;
            const currency = (stock.ticker.endsWith('.NS') || stock.ticker.endsWith('.BO')) ? 'INR' : 'USD';
            const div = document.createElement('div');
            div.className = 'p-4 flex justify-between items-center hover:bg-white/5 cursor-pointer transition-colors';
            div.onclick = () => window.location.href = `index.html?ticker=${stock.ticker}`;
            div.innerHTML = `
                <div class="flex flex-col">
                    <span class="text-xs font-bold text-white">${stock.ticker.replace('.NS', '').replace('.BO', '').replace('=X', '')}</span>
                    <span class="text-[9px] text-slate-500 uppercase">${stock.name}</span>
                </div>
                <div class="text-right">
                    <div class="text-xs font-bold text-white">${formatCurrency(stock.price, currency)}</div>
                    <div class="text-[10px] font-black ${isPositive ? 'text-secondary' : 'text-error'}">${isPositive ? '+' : ''}${stock.change.toFixed(2)}%</div>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (e) { console.error("Movers error:", e); }
}

async function loadSectors() {
    try {
        const res = await fetch(`${API_BASE}/sectors`);
        const data = await res.json();
        const container = document.getElementById('sector-mini-grid');
        if (!container) return;
        container.innerHTML = '';

        data.sectors.forEach(sector => {
            const isPositive = sector.change >= 0;
            const div = document.createElement('div');
            div.className = `sector-card ${isPositive ? 'positive bg-secondary-soft' : 'negative bg-error-soft'}`;
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">${sector.name.replace('NIFTY ', '')}</span>
                    <span class="material-symbols-outlined text-xs ${isPositive ? 'text-secondary' : 'text-error'}">${isPositive ? 'trending_up' : 'trending_down'}</span>
                </div>
                <span class="${isPositive ? 'text-secondary' : 'text-error'} text-lg font-black tracking-tighter">${isPositive ? '+' : ''}${sector.change.toFixed(2)}%</span>
            `;
            container.appendChild(div);
        });
    } catch (e) { console.error("Sectors error:", e); }
}


document.addEventListener('DOMContentLoaded', () => {
    loadMarketIndices();
    switchCategory('Indian Market');
    loadTopMovers();
    loadSectors();
    
    setInterval(() => {
        loadMarketIndices();
        loadCategoryAssets(currentCategory);
        loadGeneralNews(currentCategory);
    }, 60000); // 1 minute
});
