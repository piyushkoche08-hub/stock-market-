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
let breakoutProbSeries;
let strategyZPSeries;
let latestChartRows = [];
let latestPredictionRows = [];

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

    breakoutProbSeries = chart.addAreaSeries({
        topColor: 'rgba(244, 114, 182, 0.28)',
        bottomColor: 'rgba(244, 114, 182, 0.02)',
        lineColor: '#f472b6',
        lineWidth: 2,
        title: 'Breakout Expo',
        priceScaleId: 'breakout-pane',
        visible: showState.breakoutProb,
    });
    chart.priceScale('breakout-pane').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
        borderVisible: false,
    });

    strategyZPSeries = chart.addHistogramSeries({
        color: 'rgba(168, 85, 247, 0.42)',
        priceScaleId: 'strategy-pane',
        title: 'ZP Strength',
        visible: showState.strategyZP,
    });
    chart.priceScale('strategy-pane').applyOptions({
        scaleMargins: { top: 0.72, bottom: 0.12 },
        borderVisible: false,
    });

    // Handle resize
    window.addEventListener('resize', () => {
        chart.resize(container.clientWidth, container.clientHeight);
    });

    // TradingView Style Legend
    chart.subscribeCrosshairMove(param => {
        if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
            renderChartLegend();
            return;
        }

        const cData = param.seriesData.get(candlestickSeries);
        renderChartLegend({
            candle: cData,
            ema20: param.seriesData.get(ema20Series)?.value,
            ema50: param.seriesData.get(ema50Series)?.value,
            vwap: param.seriesData.get(vwapSeries)?.value,
            upperBB: param.seriesData.get(upperBBSeries)?.value,
            lowerBB: param.seriesData.get(lowerBBSeries)?.value,
            breakoutProb: param.seriesData.get(breakoutProbSeries)?.value,
            strategyZPStrength: param.seriesData.get(strategyZPSeries)?.value,
        });
    });
}

const showState = {
    ema20: true,
    ema50: true,
    vwap: true,
    bb: true,
    vol: true,
    ai: true,
    breakoutProb: true,
    strategyZP: true
};

function updateChartData(data, predictions) {
    if (!chart) initChart();
    if (!Array.isArray(data) || data.length === 0) {
        latestChartRows = [];
        latestPredictionRows = [];
        candlestickSeries.setData([]);
        ema20Series.setData([]);
        ema50Series.setData([]);
        vwapSeries.setData([]);
        upperBBSeries.setData([]);
        lowerBBSeries.setData([]);
        volumeSeries.setData([]);
        breakoutProbSeries.setData([]);
        strategyZPSeries.setData([]);
        predictionSeries.setData([]);
        candlestickSeries.setMarkers([]);
        renderChartLegend();
        return;
    }
    latestChartRows = data;
    latestPredictionRows = predictions || [];

    const candleData = [];
    const ema20Data = [];
    const ema50Data = [];
    const volumeData = [];
    const vwapData = [];
    const upperBBData = [];
    const lowerBBData = [];
    const breakoutProbData = [];
    const strategyZPData = [];
    const aiMarkers = [];
    const zpMarkers = [];

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
        if (item.Breakout_Prob !== null && item.Breakout_Prob !== undefined) {
            breakoutProbData.push({ time, value: item.Breakout_Prob });
        }
        if (item.ZP_Strategy_Strength !== null && item.ZP_Strategy_Strength !== undefined) {
            const signal = item.ZP_Strategy_Signal || 0;
            strategyZPData.push({
                time,
                value: item.ZP_Strategy_Strength,
                color: signal === 1
                    ? 'rgba(16, 185, 129, 0.48)'
                    : signal === -1
                        ? 'rgba(239, 68, 68, 0.48)'
                        : 'rgba(148, 163, 184, 0.20)'
            });
        }
        
        if (item.RF_Signal && item.RF_Signal !== 0) {
            const dir = item.RF_Signal;
            const isRepeatDir = dir === lastSignalDir;
            const isTooClose = Math.abs(time - lastSignalTime) < minSignalSpacingSeconds;
            if (!(isRepeatDir && isTooClose)) {
                if (dir === 1) {
                    aiMarkers.push({ time, position: 'belowBar', color: '#10b981', shape: 'arrowUp', text: `BUY` });
                } else if (dir === -1) {
                    aiMarkers.push({ time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: `SELL` });
                }
                lastSignalTime = time;
                lastSignalDir = dir;
            }
        }

        if (item.ZP_Strategy_Signal && item.ZP_Strategy_Signal !== 0) {
            if (item.ZP_Strategy_Signal === 1) {
                zpMarkers.push({ time, position: 'belowBar', color: '#10b981', shape: 'arrowUp', text: 'ZP BUY' });
            } else if (item.ZP_Strategy_Signal === -1) {
                zpMarkers.push({ time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'ZP SELL' });
            }
        }

        volumeData.push({
            time,
            value: item.Volume,
            color: item.Close >= item.Open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
        });
    });

    candlestickSeries.setData(candleData);
    currentAIMarkers = aiMarkers;
    currentZPMarkers = zpMarkers;
    candlestickSeries.setMarkers(getVisibleMarkers());
    ema20Series.setData(ema20Data);
    ema50Series.setData(ema50Data);
    vwapSeries.setData(vwapData);
    upperBBSeries.setData(upperBBData);
    lowerBBSeries.setData(lowerBBData);
    volumeSeries.setData(volumeData);
    breakoutProbSeries.setData(breakoutProbData);
    strategyZPSeries.setData(strategyZPData);

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
    renderChartLegend();
}

let showAI = true;
let currentAIMarkers = [];
let currentZPMarkers = [];

function getVisibleMarkers() {
    return [
        ...(showState.ai ? currentAIMarkers : []),
        ...(showState.strategyZP ? currentZPMarkers : [])
    ].sort((a, b) => a.time - b.time);
}

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
            candlestickSeries.setMarkers(getVisibleMarkers());
            break;
        case 'breakoutProb':
            showState.breakoutProb = isActive;
            breakoutProbSeries.applyOptions({ visible: isActive });
            break;
        case 'strategyZP':
            showState.strategyZP = isActive;
            strategyZPSeries.applyOptions({ visible: isActive });
            candlestickSeries.setMarkers(getVisibleMarkers());
            break;
    }
    renderChartLegend();
}

function fmtValue(value, digits = 2) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits) : '--';
}

function getLatestLegendPayload() {
    const last = latestChartRows[latestChartRows.length - 1] || {};
    return {
        candle: last.Close !== undefined ? {
            open: last.Open,
            high: last.High,
            low: last.Low,
            close: last.Close,
        } : null,
        ema20: last.EMA_20,
        ema50: last.EMA_50,
        vwap: last.VWAP,
        upperBB: last.Upper_BB,
        lowerBB: last.Lower_BB,
        breakoutProb: last.Breakout_Prob,
        strategyZPStrength: last.ZP_Strategy_Strength,
        strategySignal: last.ZP_Strategy_Signal,
        rfConfidence: last.RF_Confidence,
    };
}

function renderChartLegend(payload = null) {
    const legend = document.getElementById('tv-legend');
    if (!legend) return;
    const data = payload || getLatestLegendPayload();
    const candle = data.candle;
    const candleTone = candle && Number(candle.close) >= Number(candle.open) ? 'positive' : 'negative';
    const signal = data.strategySignal || getLatestLegendPayload().strategySignal || 0;
    const zpText = signal === 1 ? 'BUY' : signal === -1 ? 'SELL' : 'WAIT';

    if (!candle) {
        legend.innerHTML = '<div class="tv-legend-title">Waiting for market data...</div>';
        return;
    }

    legend.innerHTML = `
        <div class="tv-legend-title">AlphaPulse Indicators</div>
        <div class="tv-ohlc ${candleTone}">
            <span>O <b>${fmtValue(candle.open)}</b></span>
            <span>H <b>${fmtValue(candle.high)}</b></span>
            <span>L <b>${fmtValue(candle.low)}</b></span>
            <span>C <b>${fmtValue(candle.close)}</b></span>
        </div>
        <div class="tv-legend-grid">
            ${showState.ema20 ? `<span><i style="background:#3b82f6"></i>EMA 20 <b>${fmtValue(data.ema20)}</b></span>` : ''}
            ${showState.ema50 ? `<span><i style="background:#f59e0b"></i>EMA 50 <b>${fmtValue(data.ema50)}</b></span>` : ''}
            ${showState.vwap ? `<span><i style="background:#06b6d4"></i>VWAP <b>${fmtValue(data.vwap)}</b></span>` : ''}
            ${showState.bb ? `<span><i style="background:#94a3b8"></i>BB <b>${fmtValue(data.upperBB)} / ${fmtValue(data.lowerBB)}</b></span>` : ''}
            ${showState.breakoutProb ? `<span><i style="background:#f472b6"></i>Breakout Probability Expo <b>${fmtValue(data.breakoutProb)}%</b></span>` : ''}
            ${showState.strategyZP ? `<span><i style="background:#c084fc"></i>DIY Strategy Builder ZP <b>${zpText} ${fmtValue(data.strategyZPStrength)}%</b></span>` : ''}
        </div>
    `;
}
