const API_BASE = '/api';

const portfolioAssets = [
    { ticker: 'TSLA', shares: 450, costBasis: 165.20, name: 'Tesla, Inc.', symbol: 'TS' },
    { ticker: 'AMZN', shares: 1200, costBasis: 142.10, name: 'Amazon.com Inc.', symbol: 'AM' },
    { ticker: 'NVDA', shares: 120, costBasis: 450.00, name: 'Nvidia Corp', symbol: 'NV' },
    { ticker: 'PLTR', shares: 5000, costBasis: 25.10, name: 'Palantir Technologies', symbol: 'PT' }
];

const safeEl = (id) => document.getElementById(id) || {
    innerHTML: '', textContent: '', value: '', className: '',
    classList: { add:()=>{}, remove:()=>{}, toggle:()=>{}, contains:()=>false },
    style: {},
    addEventListener: ()=>{},
    setAttribute: ()=>{},
    getAttribute: ()=>null,
    appendChild: ()=>{},
    parentElement: { className: '' },
    remove: ()=>{}
};

const elements = {
    totalValue: safeEl('total-value'),
    ytdReturn: safeEl('ytd-return'),
    dailyPnl: safeEl('daily-pnl'),
    unrealizedGain: safeEl('unrealized-gain'),
    holdingsBody: safeEl('holdings-body')
};

const formatCurrency = (val, currency = 'USD') => {
    if(!val && val !== 0) return '-';
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { 
        style: 'currency', 
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(val);
};

async function loadPortfolio() {
    let totalCurrentValue = 0;
    let totalCostBasis = 0;
    let totalDailyPnl = 0;
    
    elements.holdingsBody.innerHTML = '';
    
    for (let asset of portfolioAssets) {
        try {
            const res = await fetch(`${API_BASE}/stocks/${asset.ticker}?interval=1d&period=1d`);
            if (!res.ok) throw new Error('Fetch failed');
            const stockData = await res.json();
            
            const currency = stockData.info.currency || 'USD';
            const currentPrice = stockData.info.currentPrice || stockData.info.previousClose || asset.costBasis;
            const previousClose = stockData.info.previousClose || currentPrice;
            
            const marketValue = currentPrice * asset.shares;
            const costValue = asset.costBasis * asset.shares;
            const totalReturn = marketValue - costValue;
            const totalReturnPct = (totalReturn / costValue) * 100;
            
            const dailyChange = currentPrice - previousClose;
            const dailyPnl = dailyChange * asset.shares;
            
            totalCurrentValue += marketValue;
            totalCostBasis += costValue;
            totalDailyPnl += dailyPnl;
            
            // Render row
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-white/5 transition-colors group cursor-pointer';
            tr.onclick = () => window.location.href = `index.html?ticker=${asset.ticker}`;
            
            const returnColor = totalReturn >= 0 ? 'text-secondary' : 'text-tertiary';
            const returnSign = totalReturn >= 0 ? '+' : '';
            
            tr.innerHTML = `
                <td class="px-6 py-5">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-bold text-xs">${asset.symbol}</div>
                        <div>
                            <p class="text-on-surface font-bold">${asset.ticker}</p>
                            <p class="text-[10px] text-outline">${asset.name}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-5">${formatCurrency(currentPrice, currency)}</td>
                <td class="px-6 py-5">${asset.shares.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td class="px-6 py-5 text-on-surface-variant">${formatCurrency(asset.costBasis, currency)}</td>
                <td class="px-6 py-5">${formatCurrency(marketValue, currency)}</td>
                <td class="px-6 py-5 text-right">
                    <span class="${returnColor} font-bold">${returnSign}${formatCurrency(totalReturn, currency)} (${returnSign}${totalReturnPct.toFixed(1)}%)</span>
                </td>
            `;
            elements.holdingsBody.appendChild(tr);
            
        } catch (err) {
            console.error(`Failed to load ${asset.ticker}`, err);
            // Render fallback row
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="6" class="px-6 py-5 text-error">Failed to load ${asset.ticker} data</td>`;
            elements.holdingsBody.appendChild(tr);
        }
    }
    
    // Update Summaries
    const totalUnrealized = totalCurrentValue - totalCostBasis;
    const totalReturnPct = totalCostBasis > 0 ? (totalUnrealized / totalCostBasis) * 100 : 0;
    
    elements.totalValue.textContent = formatCurrency(totalCurrentValue);
    
    elements.unrealizedGain.textContent = `${totalUnrealized >= 0 ? '+' : ''}${formatCurrency(totalUnrealized)}`;
    elements.unrealizedGain.className = `font-data-tabular font-bold ${totalUnrealized >= 0 ? 'text-secondary' : 'text-tertiary'}`;
    
    elements.dailyPnl.textContent = `${totalDailyPnl >= 0 ? '+' : ''}${formatCurrency(totalDailyPnl)}`;
    elements.dailyPnl.className = `font-data-tabular font-bold ${totalDailyPnl >= 0 ? 'text-secondary' : 'text-tertiary'}`;
    
    elements.ytdReturn.textContent = `${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}% All-Time`;
    elements.ytdReturn.parentElement.className = `px-3 py-1.5 rounded-lg border flex items-center gap-2 ${totalReturnPct >= 0 ? 'bg-secondary-container/20 border-secondary/20 text-secondary' : 'bg-error/20 border-error/20 text-error'}`;
}

document.addEventListener('DOMContentLoaded', () => {
    loadPortfolio();

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
