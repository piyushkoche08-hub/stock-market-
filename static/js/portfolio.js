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
    holdingsBody: safeEl('holdings-body'),
    analyzeBtn: safeEl('analyze-portfolio-btn'),
    screenshotInput: safeEl('portfolio-screenshot-input'),
    screenshotName: safeEl('portfolio-screenshot-name'),
    analysisResult: safeEl('portfolio-analysis-result'),
    analysisStatus: safeEl('portfolio-analysis-status')
};

let portfolioSnapshot = {
    totalCurrentValue: 0,
    totalCostBasis: 0,
    totalDailyPnl: 0,
    positions: []
};

const OCR_STOPWORDS = new Set([
    'TOTAL', 'VALUE', 'RETURN', 'MARKET', 'PORTFOLIO', 'HOLDINGS', 'PRICE', 'GAIN',
    'LOSS', 'OPEN', 'CLOSE', 'BUY', 'SELL', 'USD', 'INR', 'DAY', 'PNL', 'BALANCE'
]);
const PORTFOLIO_KEYWORDS = [
    'PORTFOLIO', 'HOLDINGS', 'ASSET', 'QTY', 'QUANTITY', 'AVG', 'AVERAGE',
    'LTP', 'P&L', 'PNL', 'MARKET VALUE', 'INVESTED', 'RETURN', 'GAIN', 'LOSS'
];

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
    portfolioSnapshot.positions = [];
    
    const fetchPromises = portfolioAssets.map(async (asset) => {
        try {
            const res = await fetch(`${API_BASE}/stocks/${asset.ticker}?interval=1d&period=1d`);
            if (!res.ok) throw new Error('Fetch failed');
            const stockData = await res.json();
            
            const info = stockData.info || {};
            const currency = info.currency || 'USD';
            const currentPrice = info.currentPrice || info.previousClose || asset.costBasis;
            const previousClose = info.previousClose || currentPrice;
            
            const marketValue = currentPrice * asset.shares;
            const costValue = asset.costBasis * asset.shares;
            const totalReturn = marketValue - costValue;
            const totalReturnPct = costValue > 0 ? (totalReturn / costValue) * 100 : 0;
            
            const dailyChange = currentPrice - previousClose;
            const dailyPnl = dailyChange * asset.shares;
            
            return {
                asset,
                currency,
                currentPrice,
                previousClose,
                marketValue,
                costValue,
                totalReturn,
                totalReturnPct,
                dailyPnl,
                stockData
            };
        } catch (err) {
            console.error(`Failed to load ${asset.ticker}`, err);
            return { asset, error: true };
        }
    });

    const results = await Promise.all(fetchPromises);

    results.forEach(res => {
        if (res.error) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="6" class="px-6 py-5 text-error text-xs font-bold uppercase tracking-widest">Connection Error: ${res.asset.ticker}</td>`;
            elements.holdingsBody.appendChild(tr);
            return;
        }

        const { asset, currency, currentPrice, marketValue, costValue, totalReturn, totalReturnPct, dailyPnl } = res;
        
        totalCurrentValue += marketValue;
        totalCostBasis += costValue;
        totalDailyPnl += dailyPnl;
        
        portfolioSnapshot.positions.push({
            ...asset,
            currentPrice,
            marketValue,
            totalReturn
        });

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/5 transition-colors group cursor-pointer border-b border-white/5 last:border-0';
        tr.onclick = () => window.location.href = `index.html?ticker=${asset.ticker}`;
        
        const returnColor = totalReturn >= 0 ? 'text-secondary' : 'text-error';
        const returnSign = totalReturn >= 0 ? '+' : '';
        
        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-black text-[10px] text-primary shadow-lg">${asset.symbol}</div>
                    <div>
                        <p class="text-on-surface font-black text-sm">${asset.ticker}</p>
                        <p class="text-[9px] text-outline uppercase font-bold tracking-tighter">${asset.name}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 font-bold text-slate-200 text-sm">${formatCurrency(currentPrice, currency)}</td>
            <td class="px-6 py-4 font-bold text-slate-400 text-sm">${asset.shares.toLocaleString()}</td>
            <td class="px-6 py-4 text-outline text-xs font-medium">${formatCurrency(asset.costBasis, currency)}</td>
            <td class="px-6 py-4 font-black text-on-surface text-sm">${formatCurrency(marketValue, currency)}</td>
            <td class="px-6 py-4 text-right">
                <div class="${returnColor} font-black text-sm">${returnSign}${formatCurrency(totalReturn, currency)}</div>
                <div class="${returnColor} text-[10px] font-bold opacity-80">${returnSign}${totalReturnPct.toFixed(2)}%</div>
            </td>
        `;
        elements.holdingsBody.appendChild(tr);
    });
    
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

function normalizeNumeric(text) {
    return Number(String(text).replace(/[^0-9.]/g, '')) || 0;
}

async function fetchDetectedTickerPrices(tickers) {
    const results = [];
    for (const ticker of tickers.slice(0, 8)) {
        try {
            const res = await fetch(`${API_BASE}/stocks/${encodeURIComponent(ticker)}?interval=1d&period=5d`);
            if (!res.ok) continue;
            const stockData = await res.json();
            const info = stockData.info || {};
            const price = info.currentPrice || info.regularMarketPrice || info.previousClose || 0;
            const prev = info.previousClose || price || 1;
            const change = prev ? ((price - prev) / prev) * 100 : 0;
            if (price) {
                results.push({
                    ticker,
                    price,
                    change
                });
            }
        } catch (e) {
            // Continue for other symbols
        }
    }
    return results;
}

async function verifyAndHydrateTickers(candidateTickers) {
    const unique = [...new Set((candidateTickers || []).filter(Boolean))];
    const verified = [];

    for (const rawTicker of unique.slice(0, 30)) {
        const attempts = [rawTicker];
        if (!rawTicker.includes('.') && !rawTicker.includes('-') && !rawTicker.includes('^')) {
            attempts.push(`${rawTicker}.NS`);
        }

        let matched = null;
        for (const ticker of attempts) {
            try {
                const res = await fetch(`${API_BASE}/stocks/${encodeURIComponent(ticker)}?interval=1d&period=5d`);
                if (!res.ok) continue;
                const data = await res.json();
                const info = data.info || {};
                const price = info.currentPrice || info.regularMarketPrice || info.previousClose || 0;
                if (price) {
                    const prev = info.previousClose || price || 1;
                    matched = {
                        ticker,
                        price,
                        change: prev ? ((price - prev) / prev) * 100 : 0
                    };
                    break;
                }
            } catch (e) {
                // Try next variant
            }
        }

        if (matched) verified.push(matched);
    }

    return verified;
}

async function extractScreenshotInsights(file) {
    if (!window.Tesseract) {
        throw new Error('OCR engine not loaded');
    }

    elements.analysisStatus.classList.remove('hidden');
    elements.analysisStatus.textContent = 'Reading screenshot text...';

    const result = await window.Tesseract.recognize(file, 'eng', {
        logger: (m) => {
            if (m.status === 'recognizing text') {
                elements.analysisStatus.textContent = `Reading screenshot text... ${Math.round((m.progress || 0) * 100)}%`;
            }
        }
    });

    const text = (result?.data?.text || '').toUpperCase();
    const rawTokens = text.match(/\b[A-Z0-9]{2,15}(?:-[A-Z0-9]{2,8}|\.NS|\.BO)?\b/g) || [];
    const tickerCandidates = [...new Set(rawTokens.filter((token) => !OCR_STOPWORDS.has(token)))];
    const numericTokens = text.match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?/g) || [];
    const numericValues = numericTokens.map(normalizeNumeric).filter((n) => n > 0);
    const verifiedTickers = await verifyAndHydrateTickers(tickerCandidates);
    return {
        rawText: text,
        tickers: verifiedTickers.map((t) => t.ticker),
        numbers: numericValues,
        liveTickerData: verifiedTickers
    };
}

function validatePortfolioScreenshot(insights) {
    const text = insights.rawText || '';
    const tickers = insights.tickers || [];
    const numbers = insights.numbers || [];
    const keywordHits = PORTFOLIO_KEYWORDS.filter((k) => text.includes(k)).length;

    // Strict gate: must look like a portfolio table/screen, not a random image.
    const looksLikePortfolio =
        (tickers.length >= 2 && numbers.length >= 4) ||
        (keywordHits >= 2 && numbers.length >= 4) ||
        (keywordHits >= 3 && tickers.length >= 1);

    return {
        isValid: looksLikePortfolio,
        keywordHits,
        tickersCount: tickers.length,
        numbersCount: numbers.length
    };
}

function renderInvalidScreenshotMessage(validation) {
    const resultBox = elements.analysisResult;
    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `
        <div class="flex flex-col gap-2">
            <h4 class="text-sm font-black text-error tracking-wide uppercase">Invalid Portfolio Screenshot</h4>
            <p class="text-xs text-on-surface-variant">This image does not look like a stock portfolio screenshot, so analysis was blocked.</p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-1">
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Portfolio Keywords</p>
                    <p class="text-sm font-bold text-on-surface">${validation.keywordHits}</p>
                </div>
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Detected Tickers</p>
                    <p class="text-sm font-bold text-on-surface">${validation.tickersCount}</p>
                </div>
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Detected Numeric Values</p>
                    <p class="text-sm font-bold text-on-surface">${validation.numbersCount}</p>
                </div>
            </div>
            <p class="text-xs text-error">Upload a clearer portfolio screenshot with symbols, quantity, value and P&L columns.</p>
        </div>
    `;
}

function renderAnalysisFromBasePortfolio() {
    const resultBox = elements.analysisResult;
    const total = portfolioSnapshot.totalCurrentValue;
    const cost = portfolioSnapshot.totalCostBasis;
    const daily = portfolioSnapshot.totalDailyPnl;

    if (!total || portfolioSnapshot.positions.length === 0) {
        resultBox.classList.remove('hidden');
        resultBox.innerHTML = '<p class="text-sm text-error font-bold">Portfolio data is not ready yet. Please wait a moment and try again.</p>';
        return;
    }

    const overallReturn = total - cost;
    const overallReturnPct = cost > 0 ? (overallReturn / cost) * 100 : 0;
    const sortedByValue = [...portfolioSnapshot.positions].sort((a, b) => b.marketValue - a.marketValue);
    const topHolding = sortedByValue[0];
    const topWeight = (topHolding.marketValue / total) * 100;
    const riskTag = topWeight >= 40 ? 'High Concentration' : (topWeight >= 25 ? 'Moderate Concentration' : 'Well Diversified');
    const riskColor = topWeight >= 40 ? 'text-error' : (topWeight >= 25 ? 'text-tertiary' : 'text-secondary');

    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `
        <div class="flex flex-col gap-2">
            <h4 class="text-sm font-black text-on-surface tracking-wide uppercase">Portfolio Analysis</h4>
            <p class="text-xs text-on-surface-variant">Analysis Source: Live holdings data.</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Total Value</p>
                    <p class="text-sm font-bold text-on-surface">${formatCurrency(total)}</p>
                </div>
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Overall Return</p>
                    <p class="text-sm font-bold ${overallReturn >= 0 ? 'text-secondary' : 'text-error'}">${overallReturn >= 0 ? '+' : ''}${formatCurrency(overallReturn)} (${overallReturnPct.toFixed(2)}%)</p>
                </div>
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Top Exposure</p>
                    <p class="text-sm font-bold text-on-surface">${topHolding.ticker} (${topWeight.toFixed(1)}%)</p>
                </div>
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Daily P&L</p>
                    <p class="text-sm font-bold ${daily >= 0 ? 'text-secondary' : 'text-error'}">${daily >= 0 ? '+' : ''}${formatCurrency(daily)}</p>
                </div>
            </div>
            <p class="text-xs mt-1 ${riskColor}"><strong>Risk View:</strong> ${riskTag}. ${topWeight >= 40 ? 'Consider reducing single-stock dependency.' : 'Current concentration is manageable.'}</p>
        </div>
    `;
}

function renderAnalysisFromScreenshot(ocrInsights, liveTickerData = []) {
    const resultBox = elements.analysisResult;
    const { tickers, numbers } = ocrInsights;
    const sampledValues = numbers.filter((n) => n >= 100).slice(0, Math.max(tickers.length, 3));
    const inferredTotal = sampledValues.reduce((a, b) => a + b, 0);
    const topValue = sampledValues.length ? Math.max(...sampledValues) : 0;
    const topWeight = inferredTotal > 0 ? (topValue / inferredTotal) * 100 : 0;
    const riskTag = topWeight >= 45 ? 'High Concentration' : (topWeight >= 30 ? 'Moderate Concentration' : 'Balanced Mix');
    const riskColor = topWeight >= 45 ? 'text-error' : (topWeight >= 30 ? 'text-tertiary' : 'text-secondary');
    const liveRows = liveTickerData.length
        ? liveTickerData.map((item) =>
            `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/20 border border-white/10 text-[11px]">
                <strong>${item.ticker}</strong>
                <span>${formatCurrency(item.price)}</span>
                <span class="${item.change >= 0 ? 'text-secondary' : 'text-error'}">${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%</span>
            </span>`
        ).join('')
        : '<span class="text-xs text-outline">No live ticker quotes found from screenshot symbols.</span>';

    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `
        <div class="flex flex-col gap-2">
            <h4 class="text-sm font-black text-on-surface tracking-wide uppercase">Screenshot Portfolio Analysis</h4>
            <p class="text-xs text-on-surface-variant">Analysis Source: OCR from uploaded screenshot.</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Detected Assets</p>
                    <p class="text-sm font-bold text-on-surface">${tickers.length > 0 ? tickers.join(', ') : 'No clear ticker detected'}</p>
                </div>
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Detected Numeric Entries</p>
                    <p class="text-sm font-bold text-on-surface">${numbers.length}</p>
                </div>
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Estimated Total Value</p>
                    <p class="text-sm font-bold text-on-surface">${inferredTotal > 0 ? formatCurrency(inferredTotal) : 'Not enough numeric data'}</p>
                </div>
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Concentration Check</p>
                    <p class="text-sm font-bold ${riskColor}">${inferredTotal > 0 ? `${topWeight.toFixed(1)}%` : 'N/A'}</p>
                </div>
            </div>
            <div class="mt-1">
                <p class="text-[10px] text-outline uppercase mb-1">Live Quotes (Detected Symbols)</p>
                <div class="flex flex-wrap gap-2">${liveRows}</div>
            </div>
            <p class="text-xs mt-1 ${riskColor}"><strong>Risk View:</strong> ${riskTag}. ${tickers.length === 0 ? 'Upload a clearer screenshot that includes ticker symbols for a stronger analysis.' : 'Detected assets were analyzed from your uploaded image.'}</p>
        </div>
    `;
}

async function analyzePortfolioNow() {
    const file = elements.screenshotInput && elements.screenshotInput.files && elements.screenshotInput.files[0];
    elements.analysisResult.classList.add('hidden');

    try {
        if (!file) {
            elements.analysisStatus.classList.remove('hidden');
            elements.analysisStatus.textContent = 'Please upload a portfolio screenshot first.';
            elements.analysisResult.classList.remove('hidden');
            elements.analysisResult.innerHTML = '<p class="text-sm text-error font-bold">No image uploaded. Upload a portfolio screenshot to analyze.</p>';
            return;
        }

        if (!file.type.startsWith('image/')) {
            throw new Error('Please upload an image file only.');
        }

        const insights = await extractScreenshotInsights(file);
        const validation = validatePortfolioScreenshot(insights);
        if (!validation.isValid) {
            elements.analysisStatus.classList.remove('hidden');
            elements.analysisStatus.textContent = 'Uploaded file rejected: not a valid portfolio screenshot.';
            renderInvalidScreenshotMessage(validation);
            return;
        }

        elements.analysisStatus.textContent = 'Screenshot analysis complete.';
        renderAnalysisFromScreenshot(insights, insights.liveTickerData || []);
    } catch (err) {
        console.error('Screenshot analysis failed:', err);
        elements.analysisStatus.classList.remove('hidden');
        elements.analysisStatus.textContent = `Screenshot analysis failed: ${err.message || 'Unknown error'}`;
        elements.analysisResult.classList.remove('hidden');
        elements.analysisResult.innerHTML = '<p class="text-sm text-error font-bold">Could not read this screenshot. Please upload a clearer portfolio image (png/jpg/webp).</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadPortfolio();

    if (elements.screenshotInput) {
        elements.screenshotInput.addEventListener('change', () => {
            const file = elements.screenshotInput.files && elements.screenshotInput.files[0];
            elements.screenshotName.textContent = file ? file.name : 'No file selected';
            elements.analysisStatus.classList.add('hidden');
        });
    }

    if (elements.analyzeBtn) {
        elements.analyzeBtn.addEventListener('click', analyzePortfolioNow);
    }

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
