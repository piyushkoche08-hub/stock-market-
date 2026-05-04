const loadingOverlay = document.getElementById('loading-overlay');
const marketCardsWrapper = document.getElementById('market-cards-wrapper');
const generalNewsContainer = document.getElementById('general-news-container');

const API_BASE = '/api';

const formatCurrency = (val, currency = 'INR', isIndex = false) => {
    if(!val && val !== 0) return '-';
    if (isIndex) {
        return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
    }
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { 
        style: 'currency', 
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(val);
};

const formatDate = (ts) => {
    if (!ts) return '';
    const date = new Date(ts * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute:'2-digit' });
};

async function loadMarketIntelligence() {
    showLoading(true);
    
    try {
        const sumRes = await fetch(`${API_BASE}/market-summary`);
        let sumData;
        if(sumRes.ok) {
            sumData = await sumRes.json();
        } else {
            throw new Error("fallback");
        }
        renderMarketCards(sumData.summary);
    } catch(err) {
        console.error("Failed to load market summary:", err);
        renderMarketCards([]);
    }

    try {
        const newsRes = await fetch(`${API_BASE}/general-news`);
        let newsData;
        if(newsRes.ok) {
            newsData = await newsRes.json();
        } else {
            throw new Error("fallback");
        }
        renderNews(newsData.news, generalNewsContainer);
    } catch(err) {
        console.error("Failed to load news:", err);
        renderNews([], generalNewsContainer);
    }

    showLoading(false);
}

function renderMarketCards(summary) {
    if (!marketCardsWrapper) return;
    marketCardsWrapper.innerHTML = '';
    if (!summary || summary.length === 0) {
        marketCardsWrapper.innerHTML = '<div class="glass-card p-4 rounded-xl text-center"><p class="text-error text-sm font-bold">Market Data Offline</p><p class="text-[10px] text-slate-500 mt-1">Check your connection or API.</p></div>';
        return;
    }
    summary.forEach(item => {
        const isPositive = item.changePercent >= 0;
        const sign = isPositive ? '+' : '';
        const colorCls = isPositive ? 'text-secondary bg-secondary/10' : 'text-error bg-error/10';
        
        let icon = 'public';
        if (item.name.includes('INR') || item.name.includes('NIFTY') || item.name.includes('SENSEX')) icon = 'account_balance';
        else if (item.name.includes('USD')) icon = 'payments';
        else if (item.name.includes('EUR')) icon = 'euro';

        const card = document.createElement('div');
        card.className = 'glass-card p-4 rounded-xl flex items-center justify-between group hover:border-blue-500/50 transition-all';
        card.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                    <span class="material-symbols-outlined text-blue-500">${icon}</span>
                </div>
                <div>
                    <h5 class="text-sm font-bold text-slate-200 group-hover:text-blue-400 transition-colors">${item.name}</h5>
                    <p class="text-[10px] text-slate-500 font-bold uppercase">Index/Forex</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold text-slate-200">${formatCurrency(item.price, item.currency, item.symbol.startsWith('^'))}</p>
                <span class="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${colorCls}">${sign}${item.changePercent.toFixed(2)}%</span>
            </div>
        `;
        marketCardsWrapper.appendChild(card);
    });
}

function renderNews(news, container) {
    if (!container) return;
    container.innerHTML = '';
    if (!news || news.length === 0) {
        container.innerHTML = '<p class="text-center w-full text-slate-500 col-span-2">No recent reports found.</p>';
        return;
    }

    news.forEach((article, index) => {
        const a = document.createElement('a');
        a.className = 'glass-card p-5 rounded-lg group cursor-pointer hover:border-blue-500/50 transition-all flex flex-col h-full';
        a.href = article.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        
        const hue = Math.floor(Math.random() * 360);
        
        const imgHtml = article.thumbnail 
            ? `<img src="${article.thumbnail}" alt="news" class="news-thumbnail object-cover" onerror="this.style.display='none'">` 
            : `<div class="news-thumbnail" style="background: linear-gradient(135deg, hsl(${hue}, 70%, 20%), hsl(${hue + 40}, 80%, 10%));"></div>`;

        const summaryHtml = article.summary ? `<p class="text-xs text-slate-400 line-clamp-3 mb-4 flex-1">${article.summary}</p>` : '<div class="flex-1"></div>';
        
        a.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <span class="text-[10px] uppercase font-bold tracking-widest text-blue-400 line-clamp-1">${article.publisher}</span>
                <span class="text-[10px] text-slate-500 whitespace-nowrap ml-2">${formatDate(article.providerPublishTime)}</span>
            </div>
            <div class="thumbnail-wrapper w-full h-32 mb-4 rounded overflow-hidden flex-shrink-0">
                ${imgHtml}
            </div>
            <h4 class="font-bold text-[16px] mb-2 group-hover:text-blue-400 transition-colors line-clamp-2">${article.title}</h4>
            ${summaryHtml}
            <div class="flex items-center justify-between border-t border-white/5 pt-4 mt-auto">
                <span class="text-[10px] font-semibold text-slate-300">Read Report</span>
                <span class="material-symbols-outlined text-slate-500 group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </div>
        `;
        container.appendChild(a);
    });
}

function showLoading(show) {
    if (!loadingOverlay) return;
    if (show) loadingOverlay.classList.remove('hidden');
    else loadingOverlay.classList.add('hidden');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadMarketIntelligence();

    const tickerInput = document.getElementById('ticker-input');
    if (tickerInput) {
        tickerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const val = tickerInput.value.trim().toUpperCase();
                if (val) window.location.href = `index.html?ticker=${val}`;
            }
        });
    }
});
