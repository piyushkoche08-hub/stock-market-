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
    displayCurrency: 'USD',
    positions: []
};

// --- Screenshot OCR + Parsing (fast & structured) ---
let _lastOcrCacheKey = null;
let _lastOcrParsed = null;

const OCR_STOPWORDS = new Set([
    'TOTAL', 'VALUE', 'RETURN', 'MARKET', 'PORTFOLIO', 'HOLDINGS', 'PRICE', 'GAIN',
    'LOSS', 'OPEN', 'CLOSE', 'BUY', 'SELL', 'USD', 'INR', 'DAY', 'PNL', 'BALANCE'
]);
const PORTFOLIO_KEYWORDS = [
    'PORTFOLIO', 'HOLDINGS', 'ASSET', 'QTY', 'QUANTITY', 'AVG', 'AVERAGE',
    'LTP', 'P&L', 'PNL', 'MARKET VALUE', 'INVESTED', 'RETURN', 'GAIN', 'LOSS'
];

const formatCurrency = (val, currency = 'USD') => {
    if (!val && val !== 0) return '-';
    const code = String(currency || 'USD').toUpperCase() === 'INR' ? 'INR' : String(currency || 'USD').toUpperCase();
    const locale = code === 'INR' ? 'en-IN' : 'en-US';
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: code.length === 3 ? code : 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(val);
    } catch {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(val);
    }
};

function formatNumber(val) {
    if (val === null || val === undefined || Number.isNaN(val)) return '-';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(val);
}

function buildOcrCacheKey(file) {
    if (!file) return '';
    return `${file.name}|${file.size}|${file.lastModified || 0}|${file.type || ''}`;
}

function withTimeout(promise, ms, errMsg) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(errMsg)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Downscale large screenshots before upload so OCR + network stay under a few seconds. */
function compressImageForOcr(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            try {
                URL.revokeObjectURL(url);
                const maxSide = 1280;
                const { width, height } = img;
                const scale = Math.min(1, maxSide / Math.max(width, height));
                const w = Math.max(1, Math.round(width * scale));
                const h = Math.max(1, Math.round(height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Could not prepare image'));
                    return;
                }
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(
                    (blob) => {
                        if (!blob) reject(new Error('Could not compress image'));
                        else resolve(blob);
                    },
                    'image/jpeg',
                    0.82
                );
            } catch (e) {
                reject(e);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Could not read image'));
        };
        img.src = url;
    });
}

async function getImageBlobForOcr(file) {
    if (file.size <= 400000) {
        return file;
    }
    return compressImageForOcr(file);
}

async function runServerOcr(imageBlob, uploadName = 'portfolio.jpg') {
    const fd = new FormData();
    fd.append('image', imageBlob, uploadName);
    const res = await withTimeout(
        fetch(`${API_BASE}/portfolio/ocr`, { method: 'POST', body: fd }),
        22000,
        'OCR took too long. Try a smaller screenshot or ensure Tesseract is installed on the server.'
    );
    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
            const j = await res.json();
            if (j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
        } catch (_) {
            /* ignore */
        }
        throw new Error(detail);
    }
    return res.json();
}

function toUpperSafe(s) {
    return String(s || '').toUpperCase();
}

function normalizeToken(raw) {
    return toUpperSafe(raw)
        .replace(/[|]/g, 'I')
        .replace(/[—–]/g, '-')
        .replace(/\s+/g, '')
        .trim();
}

function parseMaybeNumber(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    // Keep sign, decimal
    const cleaned = s
        .replace(/[,]/g, '')
        .replace(/[₹$€£]/g, '')
        .replace(/[^\d.+-]/g, '');
    if (!cleaned || cleaned === '+' || cleaned === '-' || cleaned === '.') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

/** Returns 'INR', 'USD', or null if OCR text does not hint clearly */
function detectCurrencyFromText(text) {
    const t = String(text || '');
    if (t.includes('₹') || /\bINR\b/i.test(t) || /\bRs\.?\b/i.test(t) || /\bNSE\b|\bBSE\b/i.test(t) || /SENSEX|NIFTY\s50/i.test(t)) {
        return 'INR';
    }
    if (/\bUSD\b/i.test(t) || (t.includes('$') && !t.includes('₹'))) return 'USD';
    return null;
}

function majorityCurrency(codes) {
    const list = (codes || []).filter(Boolean);
    if (!list.length) return 'USD';
    const counts = {};
    for (const c of list) {
        const k = String(c).toUpperCase() === 'INR' ? 'INR' : 'USD';
        counts[k] = (counts[k] || 0) + 1;
    }
    return (counts.INR || 0) >= (counts.USD || 0) ? 'INR' : 'USD';
}

/**
 * Choose INR vs USD for portfolio totals: live quotes > ticker suffixes > OCR text.
 */
function inferPortfolioCurrency(rawText, parsedRows, verifiedQuotes, textHint) {
    if (textHint === 'INR') return 'INR';
    if (textHint === 'USD') return 'USD';

    let inr = 0;
    let usd = 0;
    for (const q of verifiedQuotes || []) {
        if (q.currency === 'INR') inr += 1;
        else usd += 1;
    }
    if (inr > 0 && usd === 0) return 'INR';
    if (usd > 0 && inr === 0) return 'USD';
    if (inr > usd) return 'INR';
    if (usd > inr) return 'USD';

    const tickers = (parsedRows || []).map((r) => r.ticker).filter(Boolean);
    let indStocks = 0;
    let usStocks = 0;
    for (const sym of tickers) {
        if (/\.(NS|BO)$/i.test(sym)) indStocks += 1;
        else if (/^[A-Z][A-Z0-9-]{0,9}$/.test(sym)) usStocks += 1;
    }
    if (indStocks > usStocks) return 'INR';
    if (usStocks > indStocks) return 'USD';

    const t = String(rawText || '');
    if (t.includes('₹') || /\bRs\.?\b/i.test(t)) return 'INR';
    return textHint || 'USD';
}

function groupWordsIntoLines(words) {
    const w = (words || [])
        .filter(x => x && x.text && x.bbox)
        .map(x => ({
            text: String(x.text || ''),
            conf: Number(x.confidence ?? x.conf ?? 0),
            x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1,
            cx: (x.bbox.x0 + x.bbox.x1) / 2,
            cy: (x.bbox.y0 + x.bbox.y1) / 2,
        }))
        .filter(x => x.conf >= 35);

    // Sort by y, then x
    w.sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx));

    const lines = [];
    const lineTol = 10; // pixels (after preprocessing scale)
    for (const word of w) {
        let line = lines.find(l => Math.abs(l.cy - word.cy) <= lineTol);
        if (!line) {
            line = { cy: word.cy, words: [] };
            lines.push(line);
        }
        line.words.push(word);
        line.cy = (line.cy * (line.words.length - 1) + word.cy) / line.words.length;
    }

    // Sort each line by x and build text
    return lines
        .map(l => {
            l.words.sort((a, b) => a.x0 - b.x0);
            const tokens = l.words.map(wd => normalizeToken(wd.text)).filter(Boolean);
            return { cy: l.cy, words: l.words, tokens, text: tokens.join(' ') };
        })
        .filter(l => l.tokens.length > 0);
}

function looksLikeHeaderLine(lineText) {
    const t = toUpperSafe(lineText);
    const headerHits = ['ASSET', 'SYMBOL', 'QTY', 'QUANTITY', 'AVG', 'AVERAGE', 'LTP', 'PRICE', 'MARKET', 'VALUE', 'P&L', 'PNL', 'INVESTED', 'RETURN']
        .filter(k => t.includes(k)).length;
    return headerHits >= 3;
}

function extractTickerFromTokens(tokens) {
    // Common: RELIANCE, RELIANCE.NS, AAPL, TSLA, INFY.NS
    // Avoid pure numbers and long garbage.
    for (const tok of tokens) {
        const t = normalizeToken(tok);
        if (!t) continue;
        if (OCR_STOPWORDS.has(t)) continue;
        if (/^\d+$/.test(t)) continue;
        if (t.length < 2 || t.length > 12) continue;
        if (!/[A-Z]/.test(t)) continue;
        if (/^[A-Z]{1,6}(\.NS|\.BO)?$/.test(t)) return t;
        // Also allow NSE/BSE style with digits: e.g., "HDFCBANK" ok, "3MINDIA" ok
        if (/^[A-Z0-9]{2,12}(\.NS|\.BO)?$/.test(t) && /[A-Z]/.test(t)) return t;
    }
    return null;
}

function parseHoldingRow(line) {
    const tokens = line.tokens || [];
    const ticker = extractTickerFromTokens(tokens);
    if (!ticker) return null;

    // Filter out obvious non-rows
    const t = toUpperSafe(line.text);
    const keywordHits = PORTFOLIO_KEYWORDS.filter(k => t.includes(k)).length;
    if (keywordHits >= 3) return null;
    if (looksLikeHeaderLine(t)) return null;

    // Pull numeric tokens in order (left->right)
    const nums = tokens.map(parseMaybeNumber).filter(n => n !== null);
    if (nums.length === 0) return null;

    // Heuristics:
    // - quantity is usually first small-ish integer/decimal (< 1e6)
    // - avg and ltp are next two reasonable prices (< 1e7)
    // - market value is often the largest number on the row
    let qty = null;
    for (const n of nums) {
        if (n > 0 && n < 1e6) {
            qty = n;
            break;
        }
    }

    // candidate prices: between 0.01 and 1e6
    const priceCandidates = nums.filter(n => n > 0.01 && n < 1e6);
    let avg = null;
    let ltp = null;
    if (priceCandidates.length >= 2) {
        // Try to locate after qty if possible
        const idxQty = qty !== null ? nums.indexOf(qty) : -1;
        const afterQty = idxQty >= 0 ? nums.slice(idxQty + 1) : nums.slice(0);
        const afterPrices = afterQty.filter(n => n > 0.01 && n < 1e6);
        avg = afterPrices[0] ?? priceCandidates[0] ?? null;
        ltp = afterPrices[1] ?? priceCandidates[1] ?? null;
    } else if (priceCandidates.length === 1) {
        ltp = priceCandidates[0];
    }

    const marketValue = nums.length >= 3 ? Math.max(...nums) : null;

    return {
        ticker,
        qty,
        avg,
        ltp,
        marketValue,
        rawLine: line.text
    };
}

function buildPortfolioFromParsedRows(rows, currencyHint = 'USD') {
    const positions = [];
    for (const r of rows) {
        const qty = r.qty ?? null;
        const avg = r.avg ?? null;
        const ltp = r.ltp ?? null;
        const mv = r.marketValue ?? (qty && ltp ? qty * ltp : null);
        if (!qty || !ltp) continue; // must have at least qty + price to be useful

        const cost = avg ? avg * qty : null;
        const pnl = (mv !== null && cost !== null) ? (mv - cost) : null;
        positions.push({
            ticker: r.ticker,
            name: r.ticker,
            symbol: r.ticker.substring(0, 2),
            shares: qty,
            costBasis: avg ?? ltp,
            currentPrice: ltp,
            marketValue: mv,
            totalReturn: pnl ?? 0,
            currency: currencyHint
        });
    }
    return positions;
}

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
            const currency = String(info.currency || 'USD').toUpperCase() === 'INR' ? 'INR' : 'USD';
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
        const rowCurrency = String(currency || 'USD').toUpperCase() === 'INR' ? 'INR' : 'USD';

        totalCurrentValue += marketValue;
        totalCostBasis += costValue;
        totalDailyPnl += dailyPnl;

        portfolioSnapshot.positions.push({
            ...asset,
            currentPrice,
            marketValue,
            totalReturn,
            currency: rowCurrency,
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
            <td class="px-6 py-4 font-bold text-slate-200 text-sm">${formatCurrency(currentPrice, rowCurrency)}</td>
            <td class="px-6 py-4 font-bold text-slate-400 text-sm">${asset.shares.toLocaleString()}</td>
            <td class="px-6 py-4 text-outline text-xs font-medium">${formatCurrency(asset.costBasis, rowCurrency)}</td>
            <td class="px-6 py-4 font-black text-on-surface text-sm">${formatCurrency(marketValue, rowCurrency)}</td>
            <td class="px-6 py-4 text-right">
                <div class="${returnColor} font-black text-sm">${returnSign}${formatCurrency(totalReturn, rowCurrency)}</div>
                <div class="${returnColor} text-[10px] font-bold opacity-80">${returnSign}${totalReturnPct.toFixed(2)}%</div>
            </td>
        `;
        elements.holdingsBody.appendChild(tr);
    });
    
    // Update Summaries (same currency as majority of holdings — US vs Indian market)
    const totalUnrealized = totalCurrentValue - totalCostBasis;
    const totalReturnPct = totalCostBasis > 0 ? (totalUnrealized / totalCostBasis) * 100 : 0;
    const currencies = results.filter((r) => !r.error && r.currency).map((r) => r.currency);
    const primaryCurrency = majorityCurrency(currencies);

    elements.totalValue.textContent = formatCurrency(totalCurrentValue, primaryCurrency);

    elements.unrealizedGain.textContent = `${totalUnrealized >= 0 ? '+' : ''}${formatCurrency(totalUnrealized, primaryCurrency)}`;
    elements.unrealizedGain.className = `font-data-tabular font-bold ${totalUnrealized >= 0 ? 'text-secondary' : 'text-tertiary'}`;

    elements.dailyPnl.textContent = `${totalDailyPnl >= 0 ? '+' : ''}${formatCurrency(totalDailyPnl, primaryCurrency)}`;
    elements.dailyPnl.className = `font-data-tabular font-bold ${totalDailyPnl >= 0 ? 'text-secondary' : 'text-tertiary'}`;
    
    elements.ytdReturn.textContent = `${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}% All-Time`;
    elements.ytdReturn.parentElement.className = `px-3 py-1.5 rounded-lg border flex items-center gap-2 ${totalReturnPct >= 0 ? 'bg-secondary-container/20 border-secondary/20 text-secondary' : 'bg-error/20 border-error/20 text-error'}`;

    // Persist snapshot for analysis panel
    portfolioSnapshot.totalCurrentValue = totalCurrentValue;
    portfolioSnapshot.totalCostBasis = totalCostBasis;
    portfolioSnapshot.totalDailyPnl = totalDailyPnl;
    portfolioSnapshot.displayCurrency = primaryCurrency;
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

const STOCK_QUOTE_QUERY = '?interval=1d&period=1d';

async function resolveOneTicker(rawTicker) {
    const attempts = [rawTicker];
    if (!rawTicker.includes('.') && !rawTicker.includes('-') && !rawTicker.includes('^')) {
        attempts.push(`${rawTicker}.NS`);
    }
    const urls = attempts.map(
        (ticker) => `${API_BASE}/stocks/${encodeURIComponent(ticker)}${STOCK_QUOTE_QUERY}`
    );
    const responses = await Promise.all(
        urls.map((url) =>
            fetch(url)
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
        )
    );
    for (let i = 0; i < attempts.length; i++) {
        const data = responses[i];
        if (!data) continue;
        const ticker = attempts[i];
        const info = data.info || {};
        const price = info.currentPrice || info.regularMarketPrice || info.previousClose || 0;
        if (price) {
            const prev = info.previousClose || price || 1;
            const cur = String(info.currency || 'USD').toUpperCase();
            const currency = cur === 'INR' ? 'INR' : 'USD';
            return {
                ticker,
                price,
                change: prev ? ((price - prev) / prev) * 100 : 0,
                currency,
            };
        }
    }
    return null;
}

/** Cap symbols and resolve in parallel so totals stay in the 1–6s range with OCR. */
async function verifyAndHydrateTickers(candidateTickers) {
    const unique = [...new Set((candidateTickers || []).filter(Boolean))].slice(0, 12);
    const batch = await Promise.all(unique.map((t) => resolveOneTicker(t)));
    return batch.filter(Boolean);
}

/** When OCR returns plain text without word boxes, synthesize coarse boxes so row parsing works */
function pseudoWordsFromPlainText(rawText) {
    const words = [];
    let y = 0;
    const lineHeight = 18;
    for (const line of String(rawText || '').split(/\r?\n/)) {
        let x = 4;
        const parts = line.trim().split(/\s+/).filter(Boolean);
        for (const p of parts) {
            const wch = Math.max(28, p.length * 9);
            words.push({
                text: p,
                confidence: 65,
                bbox: { x0: x, y0: y, x1: x + wch, y1: y + lineHeight },
            });
            x += wch + 6;
        }
        y += lineHeight + 4;
    }
    return words;
}

/** OCR + row parsing only (no quote API). Caller runs validation then hydrates tickers. */
async function prepareScreenshotInsights(file) {
    elements.analysisStatus.classList.remove('hidden');
    elements.analysisStatus.textContent = 'Optimizing image…';
    const imageBlob = await getImageBlobForOcr(file);
    const uploadName =
        (file.name && file.name.replace(/\.[^.]+$/, '.jpg')) || 'portfolio.jpg';

    elements.analysisStatus.textContent = 'Reading screenshot…';
    const payload = await runServerOcr(imageBlob, uploadName);
    elements.analysisStatus.textContent = `Parsing (${payload.engine || 'ocr'})…`;

    const rawText = payload.text || '';
    let words = Array.isArray(payload.words) ? payload.words : [];
    if ((!words.length || words.every((w) => !w || !w.bbox)) && rawText.trim()) {
        words = pseudoWordsFromPlainText(rawText);
    }
    const upperText = toUpperSafe(rawText);
    const textCurrencyHint = detectCurrencyFromText(rawText);

    const lines = groupWordsIntoLines(words);
    const parsedRows = [];
    for (const line of lines) {
        const row = parseHoldingRow(line);
        if (row) parsedRows.push(row);
    }

    const bestByTicker = new Map();
    for (const r of parsedRows) {
        const prev = bestByTicker.get(r.ticker);
        const score = (r.qty ? 1 : 0) + (r.avg ? 1 : 0) + (r.ltp ? 1 : 0) + (r.marketValue ? 1 : 0);
        const prevScore = prev ? ((prev.qty ? 1 : 0) + (prev.avg ? 1 : 0) + (prev.ltp ? 1 : 0) + (prev.marketValue ? 1 : 0)) : -1;
        if (!prev || score > prevScore) bestByTicker.set(r.ticker, r);
    }

    const rows = [...bestByTicker.values()];
    const numbers = upperText.match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?/g)?.map(normalizeNumeric).filter((n) => n > 0) || [];

    return {
        upperText,
        rawText,
        rows,
        candidateTickers: rows.map((r) => r.ticker),
        numbers,
        textCurrencyHint,
        engine: payload.engine || 'ocr',
    };
}

function validatePortfolioScreenshot(insights) {
    const text = insights.rawText || '';
    const tickers = insights.tickers || [];
    const numbers = insights.numbers || [];
    const keywordHits = PORTFOLIO_KEYWORDS.filter((k) => text.includes(k)).length;
    const parsedRowsCount = (insights.parsedRows || []).length;

    // Strict gate: must look like a portfolio table/screen, not a random image.
    const looksLikePortfolio =
        (tickers.length >= 2 && numbers.length >= 4) ||
        (keywordHits >= 2 && numbers.length >= 4) ||
        (keywordHits >= 3 && tickers.length >= 1) ||
        (parsedRowsCount >= 2);

    return {
        isValid: looksLikePortfolio,
        keywordHits,
        tickersCount: tickers.length,
        numbersCount: numbers.length,
        parsedRowsCount
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
            <p class="text-xs text-outline">Parsed rows: <strong>${validation.parsedRowsCount ?? 0}</strong></p>
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
            <p class="text-xs text-on-surface-variant">Analysis Source: Live holdings data. Display currency: <strong>${portfolioSnapshot.displayCurrency === 'INR' ? '₹ INR' : '$ USD'}</strong></p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Total Value</p>
                    <p class="text-sm font-bold text-on-surface">${formatCurrency(total, portfolioSnapshot.displayCurrency)}</p>
                </div>
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Overall Return</p>
                    <p class="text-sm font-bold ${overallReturn >= 0 ? 'text-secondary' : 'text-error'}">${overallReturn >= 0 ? '+' : ''}${formatCurrency(overallReturn, portfolioSnapshot.displayCurrency)} (${overallReturnPct.toFixed(2)}%)</p>
                </div>
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Top Exposure</p>
                    <p class="text-sm font-bold text-on-surface">${topHolding.ticker} (${topWeight.toFixed(1)}%)</p>
                </div>
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Daily P&L</p>
                    <p class="text-sm font-bold ${daily >= 0 ? 'text-secondary' : 'text-error'}">${daily >= 0 ? '+' : ''}${formatCurrency(daily, portfolioSnapshot.displayCurrency)}</p>
                </div>
            </div>
            <p class="text-xs mt-1 ${riskColor}"><strong>Risk View:</strong> ${riskTag}. ${topWeight >= 40 ? 'Consider reducing single-stock dependency.' : 'Current concentration is manageable.'}</p>
        </div>
    `;
}

function renderAnalysisFromScreenshot(ocrInsights, liveTickerData = []) {
    const resultBox = elements.analysisResult;
    const { tickers, currency, parsedRows } = ocrInsights;
    const displayCcy = currency || 'USD';
    const positions = buildPortfolioFromParsedRows(parsedRows || [], displayCcy);

    const inferredTotal = positions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
    const topHolding = [...positions].sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))[0];
    const topWeight = (inferredTotal > 0 && topHolding) ? ((topHolding.marketValue || 0) / inferredTotal) * 100 : 0;
    const riskTag = topWeight >= 45 ? 'High Concentration' : (topWeight >= 30 ? 'Moderate Concentration' : 'Balanced Mix');
    const riskColor = topWeight >= 45 ? 'text-error' : (topWeight >= 30 ? 'text-tertiary' : 'text-secondary');
    const liveRows = liveTickerData.length
        ? liveTickerData.map((item) =>
            `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/20 border border-white/10 text-[11px]">
                <strong>${item.ticker}</strong>
                <span>${formatCurrency(item.price, item.currency || displayCcy)}</span>
                <span class="${item.change >= 0 ? 'text-secondary' : 'text-error'}">${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%</span>
            </span>`
        ).join('')
        : '<span class="text-xs text-outline">No live ticker quotes found from screenshot symbols.</span>';

    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `
        <div class="flex flex-col gap-2">
            <h4 class="text-sm font-black text-on-surface tracking-wide uppercase">Screenshot Portfolio Analysis</h4>
            <p class="text-xs text-on-surface-variant">Analysis Source: OCR (structured row extraction). Display currency: <strong>${displayCcy === 'INR' ? '₹ INR' : '$ USD'}</strong></p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Detected Assets</p>
                    <p class="text-sm font-bold text-on-surface">${tickers.length > 0 ? tickers.join(', ') : 'No clear ticker detected'}</p>
                </div>
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Parsed Holdings</p>
                    <p class="text-sm font-bold text-on-surface">${positions.length}</p>
                </div>
                <div class="bg-black/20 rounded-lg p-3 border border-white/10">
                    <p class="text-[10px] text-outline uppercase mb-1">Estimated Total Value</p>
                    <p class="text-sm font-bold text-on-surface">${inferredTotal > 0 ? formatCurrency(inferredTotal, displayCcy) : 'Could not compute from screenshot'}</p>
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

    // If we parsed real positions, update the UI table + totals immediately.
    if (positions.length >= 1) {
        applyScreenshotPortfolioToUi(positions, displayCcy);
    }
}

function applyScreenshotPortfolioToUi(positions, currency) {
    // Replace the table with screenshot-derived holdings
    elements.holdingsBody.innerHTML = '';

    let totalCurrentValue = 0;
    let totalCostBasis = 0;
    let totalDailyPnl = 0; // can't reliably infer from screenshot

    const sorted = [...positions].sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));

    for (const p of sorted.slice(0, 50)) {
        const mv = p.marketValue || (p.currentPrice && p.shares ? p.currentPrice * p.shares : 0);
        const cost = (p.costBasis && p.shares) ? p.costBasis * p.shares : 0;
        const ret = mv - cost;
        const retPct = cost > 0 ? (ret / cost) * 100 : 0;

        totalCurrentValue += mv;
        totalCostBasis += cost;

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/5 transition-colors group cursor-pointer border-b border-white/5 last:border-0';
        tr.onclick = () => window.location.href = `index.html?ticker=${encodeURIComponent(p.ticker)}`;

        const returnColor = ret >= 0 ? 'text-secondary' : 'text-error';
        const returnSign = ret >= 0 ? '+' : '';

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-black text-[10px] text-primary shadow-lg">${(p.ticker || '').slice(0, 2)}</div>
                    <div>
                        <p class="text-on-surface font-black text-sm">${p.ticker}</p>
                        <p class="text-[9px] text-outline uppercase font-bold tracking-tighter">From screenshot</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 font-bold text-slate-200 text-sm">${formatCurrency(p.currentPrice || 0, currency)}</td>
            <td class="px-6 py-4 font-bold text-slate-400 text-sm">${formatNumber(p.shares)}</td>
            <td class="px-6 py-4 text-outline text-xs font-medium">${formatCurrency(p.costBasis || 0, currency)}</td>
            <td class="px-6 py-4 font-black text-on-surface text-sm">${formatCurrency(mv, currency)}</td>
            <td class="px-6 py-4 text-right">
                <div class="${returnColor} font-black text-sm">${returnSign}${formatCurrency(ret, currency)}</div>
                <div class="${returnColor} text-[10px] font-bold opacity-80">${returnSign}${retPct.toFixed(2)}%</div>
            </td>
        `;
        elements.holdingsBody.appendChild(tr);
    }

    // Update top cards
    const totalUnrealized = totalCurrentValue - totalCostBasis;
    const totalReturnPct = totalCostBasis > 0 ? (totalUnrealized / totalCostBasis) * 100 : 0;

    elements.totalValue.textContent = formatCurrency(totalCurrentValue, currency);
    elements.unrealizedGain.textContent = `${totalUnrealized >= 0 ? '+' : ''}${formatCurrency(totalUnrealized, currency)}`;
    elements.unrealizedGain.className = `font-data-tabular font-bold ${totalUnrealized >= 0 ? 'text-secondary' : 'text-tertiary'}`;

    elements.dailyPnl.textContent = '—';
    elements.dailyPnl.className = 'font-data-tabular font-bold text-outline';

    elements.ytdReturn.textContent = `${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}% All-Time`;
    elements.ytdReturn.parentElement.className = `px-3 py-1.5 rounded-lg border flex items-center gap-2 ${totalReturnPct >= 0 ? 'bg-secondary-container/20 border-secondary/20 text-secondary' : 'bg-error/20 border-error/20 text-error'}`;

    portfolioSnapshot.totalCurrentValue = totalCurrentValue;
    portfolioSnapshot.totalCostBasis = totalCostBasis;
    portfolioSnapshot.totalDailyPnl = totalDailyPnl;
    portfolioSnapshot.displayCurrency = currency;
    portfolioSnapshot.positions = sorted;
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

        const cacheKey = buildOcrCacheKey(file);
        if (cacheKey && cacheKey === _lastOcrCacheKey && _lastOcrParsed) {
            elements.analysisStatus.classList.remove('hidden');
            elements.analysisStatus.textContent = 'Showing last analysis (instant).';
            renderAnalysisFromScreenshot(_lastOcrParsed, _lastOcrParsed.liveTickerData || []);
            return;
        }

        const prepared = await prepareScreenshotInsights(file);
        const validation = validatePortfolioScreenshot({
            rawText: prepared.upperText,
            tickers: prepared.candidateTickers,
            numbers: prepared.numbers,
            parsedRows: prepared.rows,
        });
        if (!validation.isValid) {
            elements.analysisStatus.classList.remove('hidden');
            elements.analysisStatus.textContent = 'Uploaded file rejected: not a valid portfolio screenshot.';
            renderInvalidScreenshotMessage(validation);
            return;
        }

        const quickCurrency = inferPortfolioCurrency(prepared.rawText, prepared.rows, [], prepared.textCurrencyHint);
        const partialInsights = {
            rawText: prepared.upperText,
            tickers: prepared.candidateTickers,
            numbers: prepared.numbers,
            liveTickerData: [],
            currency: quickCurrency,
            parsedRows: prepared.rows,
        };

        elements.analysisStatus.textContent = 'Showing analysis — loading live quotes…';
        renderAnalysisFromScreenshot(partialInsights, []);

        const liveTickerData = await verifyAndHydrateTickers(prepared.candidateTickers);
        const currency = inferPortfolioCurrency(
            prepared.rawText,
            prepared.rows,
            liveTickerData,
            prepared.textCurrencyHint
        );
        const insights = {
            rawText: prepared.upperText,
            tickers: liveTickerData.map((t) => t.ticker),
            numbers: prepared.numbers,
            liveTickerData,
            currency,
            parsedRows: prepared.rows,
        };

        _lastOcrCacheKey = cacheKey;
        _lastOcrParsed = insights;

        elements.analysisStatus.textContent = 'Screenshot analysis complete.';
        renderAnalysisFromScreenshot(insights, liveTickerData);
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
