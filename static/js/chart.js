// static/js/chart.js

let chart;
let candlestickSeries;
let ema20Series;
let ema50Series;
let predictionSeries;
let volumeSeries;
let vwapSeries;
let upperBBSeries;
let lowerBBSeries;

function initChart() {
    const container = document.getElementById('tvchart');
    container.innerHTML = ''; // Clear existing
    
    chart = LightweightCharts.createChart(container, {
        layout: {
            background: { type: 'solid', color: 'transparent' },
            textColor: '#94a3b8',
        },
        grid: {
            vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
            horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: 'rgba(255, 255, 255, 0.1)',
        },
        timeScale: {
            borderColor: 'rgba(255, 255, 255, 0.1)',
            timeVisible: true,
            secondsVisible: false,
        },
    });

    candlestickSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
    });

    ema20Series = chart.addLineSeries({
        color: '#3b82f6',
        lineWidth: 2,
        title: 'EMA 20',
    });

    ema50Series = chart.addLineSeries({
        color: '#f59e0b',
        lineWidth: 2,
        title: 'EMA 50',
    });

    predictionSeries = chart.addLineSeries({
        color: '#c084fc',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'AI Predict',
    });
    
    vwapSeries = chart.addLineSeries({
        color: '#06b6d4',
        lineWidth: 1,
        title: 'VWAP',
    });

    upperBBSeries = chart.addLineSeries({
        color: 'rgba(255, 255, 255, 0.3)',
        lineWidth: 1,
        title: 'Upper BB',
    });

    lowerBBSeries = chart.addLineSeries({
        color: 'rgba(255, 255, 255, 0.3)',
        lineWidth: 1,
        title: 'Lower BB',
    });
    
    volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '', // overlay
    });
    volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
    });

    // Handle resize
    window.addEventListener('resize', () => {
        chart.resize(container.clientWidth, container.clientHeight);
    });

    // TradingView Style Legend
    chart.subscribeCrosshairMove(param => {
        const legend = document.getElementById('tv-legend');
        if (!legend) return;
        
        if (!param.time || param.point.x < 0 || param.point.y < 0) {
            legend.style.opacity = '0';
            return;
        }
        legend.style.opacity = '1';

        const cData = param.seriesData.get(candlestickSeries);
        const e20 = param.seriesData.get(ema20Series);
        const e50 = param.seriesData.get(ema50Series);
        const vwap = param.seriesData.get(vwapSeries);
        const ubb = param.seriesData.get(upperBBSeries);
        const lbb = param.seriesData.get(lowerBBSeries);

        let html = '';
        if (cData) {
            html += `<div style="display:flex; gap:8px;">
                <span style="color:var(--text-muted)">O</span><span style="color:${cData.open > cData.close ? '#ef4444' : '#10b981'}">${cData.open.toFixed(2)}</span>
                <span style="color:var(--text-muted)">H</span><span style="color:${cData.open > cData.close ? '#ef4444' : '#10b981'}">${cData.high.toFixed(2)}</span>
                <span style="color:var(--text-muted)">L</span><span style="color:${cData.open > cData.close ? '#ef4444' : '#10b981'}">${cData.low.toFixed(2)}</span>
                <span style="color:var(--text-muted)">C</span><span style="color:${cData.open > cData.close ? '#ef4444' : '#10b981'}">${cData.close.toFixed(2)}</span>
            </div>`;
        }
        if (showState.ema20 && e20) html += `<div style="color: #3b82f6;">EMA 20 <span style="font-weight:bold">${e20.value.toFixed(2)}</span></div>`;
        if (showState.ema50 && e50) html += `<div style="color: #f59e0b;">EMA 50 <span style="font-weight:bold">${e50.value.toFixed(2)}</span></div>`;
        if (showState.vwap && vwap) html += `<div style="color: #06b6d4;">VWAP <span style="font-weight:bold">${vwap.value.toFixed(2)}</span></div>`;
        if (showState.bb && ubb && lbb) html += `<div style="color: #94a3b8;">BB <span style="font-weight:bold">${ubb.value.toFixed(2)} / ${lbb.value.toFixed(2)}</span></div>`;
        
        legend.innerHTML = html;
    });
}

const showState = {
    ema20: true,
    ema50: true,
    vwap: true,
    bb: true,
    vol: true,
    ai: true
};

function updateChartData(data, predictions) {
    if (!chart) initChart();

    const candleData = [];
    const ema20Data = [];
    const ema50Data = [];
    const volumeData = [];
    const vwapData = [];
    const upperBBData = [];
    const lowerBBData = [];
    const markers = [];

    // Thin RF signals to avoid overlapping BUY/SELL labels:
    // - keep only the first signal in a local window
    // - collapse repeated same-direction signals
    let lastSignalTime = 0;
    let lastSignalDir = 0;
    const minSignalSpacingSeconds = 60 * 60 * 8; // ~8h spacing for dense intraday; harmless for daily too

    data.forEach(item => {
        // Lightweight charts expects timestamp in seconds
        const time = new Date(item.Date).getTime() / 1000;
        
        candleData.push({ time, open: item.Open, high: item.High, low: item.Low, close: item.Close });
        
        if (item.EMA_20) ema20Data.push({ time, value: item.EMA_20 });
        if (item.EMA_50) ema50Data.push({ time, value: item.EMA_50 });
        if (item.VWAP) vwapData.push({ time, value: item.VWAP });
        if (item.Upper_BB) upperBBData.push({ time, value: item.Upper_BB });
        if (item.Lower_BB) lowerBBData.push({ time, value: item.Lower_BB });
        
        if (showState.ai && item.RF_Signal && item.RF_Signal !== 0) {
            const dir = item.RF_Signal;
            const isRepeatDir = dir === lastSignalDir;
            const isTooClose = Math.abs(time - lastSignalTime) < minSignalSpacingSeconds;
            if (!(isRepeatDir && isTooClose)) {
                if (dir === 1) {
                    markers.push({ time, position: 'belowBar', color: '#10b981', shape: 'arrowUp', text: `BUY` });
                } else if (dir === -1) {
                    markers.push({ time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: `SELL` });
                }
                lastSignalTime = time;
                lastSignalDir = dir;
            }
        }

        volumeData.push({
            time,
            value: item.Volume,
            color: item.Close >= item.Open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
        });
    });

    candlestickSeries.setData(candleData);
    currentMarkers = markers;
    if (showAI) {
        candlestickSeries.setMarkers(markers);
    } else {
        candlestickSeries.setMarkers([]);
    }
    ema20Series.setData(ema20Data);
    ema50Series.setData(ema50Data);
    vwapSeries.setData(vwapData);
    upperBBSeries.setData(upperBBData);
    lowerBBSeries.setData(lowerBBData);
    volumeSeries.setData(volumeData);

    // AI Predictions
    const predData = [];
    if (predictions && predictions.length > 0) {
        // connect the last real candle to the first prediction
        if (candleData.length > 0) {
            const lastCandle = candleData[candleData.length - 1];
            predData.push({ time: lastCandle.time, value: lastCandle.close });
        }
        
        predictions.forEach(p => {
            predData.push({
                time: new Date(p.Date).getTime() / 1000,
                value: p.Predicted_Close
            });
        });
        predictionSeries.setData(predData);
    } else {
        predictionSeries.setData([]);
    }

    chart.timeScale().fitContent();
}

let showAI = true;
let currentMarkers = [];

function toggleIndicator(target, isActive) {
    if (!chart) return;
    
    switch(target) {
        case 'ema20':
            showState.ema20 = isActive;
            ema20Series.applyOptions({ visible: isActive });
            break;
        case 'ema50':
            showState.ema50 = isActive;
            ema50Series.applyOptions({ visible: isActive });
            break;
        case 'vwap':
            showState.vwap = isActive;
            vwapSeries.applyOptions({ visible: isActive });
            break;
        case 'bb':
            showState.bb = isActive;
            upperBBSeries.applyOptions({ visible: isActive });
            lowerBBSeries.applyOptions({ visible: isActive });
            break;
        case 'vol':
            showState.vol = isActive;
            volumeSeries.applyOptions({ visible: isActive });
            break;
        case 'ai':
            showState.ai = isActive;
            showAI = isActive;
            predictionSeries.applyOptions({ visible: isActive });
            if (isActive) {
                candlestickSeries.setMarkers(currentMarkers);
            } else {
                candlestickSeries.setMarkers([]);
            }
            break;
    }
}
