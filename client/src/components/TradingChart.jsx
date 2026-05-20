import React, { useEffect, useRef } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import useStore from '../store/useStore';
import ChartLegend from './ChartLegend';

const TradingChart = () => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef({});
  
  const { data, predictions, indicators, loading, ticker, timeframe } = useStore();

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: 'Inter',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
      timeScale: { borderColor: 'rgba(255, 255, 255, 0.1)', timeVisible: true },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    chartRef.current = chart;

    // Handle Resize
    const handleResize = () => {
      chart.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Update Series Data
  useEffect(() => {
    if (!chartRef.current || !data.length) return;

    const chart = chartRef.current;
    
    // Check if we need to full-reset (e.g. ticker change or first load)
    const isTickerChange = !seriesRef.current.ticker || seriesRef.current.ticker !== ticker;
    const isTimeframeChange = !seriesRef.current.timeframe || seriesRef.current.timeframe !== timeframe;

    if (isTickerChange || isTimeframeChange) {
      // Clear existing series
      Object.values(seriesRef.current).forEach(s => {
        if (typeof s === 'object' && s !== null && 'setData' in s) {
          try { chart.removeSeries(s); } catch(e) {}
        }
      });
      seriesRef.current = { ticker, timeframe };

      // 1. Main Candlestick Series
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#00D09C',
        downColor: '#EB5B3C',
        borderVisible: false,
        wickUpColor: '#00D09C',
        wickDownColor: '#EB5B3C',
      });
      
      const formattedData = data.map(d => ({
        time: Math.floor(new Date(d.Date).getTime() / 1000),
        open: d.Open,
        high: d.High,
        low: d.Low,
        close: d.Close,
      })).sort((a, b) => a.time - b.time);

      candleSeries.setData(formattedData);
      seriesRef.current.candles = candleSeries;

      chart.timeScale().fitContent();
    }

    // Now update or set data for all series
    const hasVal = (v) => v !== null && v !== undefined;
    const timestamps = data.map(d => Math.floor(new Date(d.Date).getTime() / 1000));

    // Helper to update series efficiently
    const updateOrSet = (seriesKey, dataMapper, filterFn = () => true) => {
      const s = seriesRef.current[seriesKey];
      if (!s) return;
      const mapped = data.reduce((acc, item, index) => {
        if (filterFn(item, index)) acc.push(dataMapper(item, index));
        return acc;
      }, []);
      if (mapped.length > 0) {
        // If it's a small update (last point), we could use .update(), 
        // but for indicators it's safer to .setData if the indicators are calculated on the whole set
        s.setData(mapped);
      }
    };

    // Update Candles (using update for the last point if it's an incremental change)
    if (seriesRef.current.candles) {
      const lastPoint = {
        time: timestamps[timestamps.length - 1],
        open: data[data.length - 1].Open,
        high: data[data.length - 1].High,
        low: data[data.length - 1].Low,
        close: data[data.length - 1].Close,
      };
      seriesRef.current.candles.update(lastPoint);
    }

    // Update Indicators
    const handleDynamicIndicator = (key, type, options, dataMapper, filterFn = () => true) => {
      if (indicators[key]) {
        if (!seriesRef.current[key]) {
          if (type === 'line') seriesRef.current[key] = chart.addLineSeries(options);
          if (type === 'area') seriesRef.current[key] = chart.addAreaSeries(options);
          if (type === 'histogram') seriesRef.current[key] = chart.addHistogramSeries(options);
        }
        updateOrSet(key, dataMapper, filterFn);
      } else if (seriesRef.current[key]) {
        chart.removeSeries(seriesRef.current[key]);
        delete seriesRef.current[key];
      }
    };

    handleDynamicIndicator('ema20', 'line', { color: '#3b82f6', lineWidth: 1.5, title: 'EMA 20' }, (d, i) => ({ time: timestamps[i], value: d.EMA_20 }), d => hasVal(d.EMA_20));
    handleDynamicIndicator('ema50', 'line', { color: '#f59e0b', lineWidth: 1.5, title: 'EMA 50' }, (d, i) => ({ time: timestamps[i], value: d.EMA_50 }), d => hasVal(d.EMA_50));
    handleDynamicIndicator('ema200', 'line', { color: '#ef4444', lineWidth: 1.5, title: 'EMA 200' }, (d, i) => ({ time: timestamps[i], value: d.EMA_200 }), d => hasVal(d.EMA_200));
    handleDynamicIndicator('vwap', 'line', { color: '#06b6d4', lineWidth: 1, title: 'VWAP' }, (d, i) => ({ time: timestamps[i], value: d.VWAP }), d => hasVal(d.VWAP) && d.VWAP !== 0);
    
    // SPECTRA Engine Rendering
    handleDynamicIndicator('spectra', 'line', { color: '#ec4899', lineWidth: 2, title: 'SPECTRA Filt' }, (d, i) => ({ time: timestamps[i], value: d.SPECTRA_Filt }), d => hasVal(d.SPECTRA_Filt));

    // Lux S/R Rendering
    if (indicators.luxSR) {
      if (!seriesRef.current.luxResist) {
        seriesRef.current.luxResist = chart.addLineSeries({ color: 'rgba(239, 68, 68, 0.8)', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'Resistance' });
        seriesRef.current.luxSupport = chart.addLineSeries({ color: 'rgba(34, 197, 94, 0.8)', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'Support' });
      }
      updateOrSet('luxResist', (d, i) => ({ time: timestamps[i], value: d.Lux_Resist }), d => hasVal(d.Lux_Resist));
      updateOrSet('luxSupport', (d, i) => ({ time: timestamps[i], value: d.Lux_Support }), d => hasVal(d.Lux_Support));
    } else {
      if (seriesRef.current.luxResist) { chart.removeSeries(seriesRef.current.luxResist); delete seriesRef.current.luxResist; }
      if (seriesRef.current.luxSupport) { chart.removeSeries(seriesRef.current.luxSupport); delete seriesRef.current.luxSupport; }
    }
    
    if (indicators.bb) {
      if (!seriesRef.current.bbUpper) {
        seriesRef.current.bbUpper = chart.addLineSeries({ color: 'rgba(255,255,255,0.15)', lineWidth: 1, title: 'BB Upper' });
        seriesRef.current.bbLower = chart.addLineSeries({ color: 'rgba(255,255,255,0.15)', lineWidth: 1, title: 'BB Lower' });
      }
      updateOrSet('bbUpper', (d, i) => ({ time: timestamps[i], value: d.Upper_BB }), d => hasVal(d.Upper_BB) && d.Upper_BB !== 0);
      updateOrSet('bbLower', (d, i) => ({ time: timestamps[i], value: d.Lower_BB }), d => hasVal(d.Lower_BB) && d.Lower_BB !== 0);
    } else {
      if (seriesRef.current.bbUpper) { chart.removeSeries(seriesRef.current.bbUpper); delete seriesRef.current.bbUpper; }
      if (seriesRef.current.bbLower) { chart.removeSeries(seriesRef.current.bbLower); delete seriesRef.current.bbLower; }
    }
    
    if (indicators.rsi) {
      if (!seriesRef.current.rsi) {
        seriesRef.current.rsi = chart.addLineSeries({ color: '#c084fc', lineWidth: 1.5, title: 'RSI', priceScaleId: 'rsi-pane' });
        chart.priceScale('rsi-pane').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.8 } });
      }
      updateOrSet('rsi', (d, i) => ({ time: timestamps[i], value: d.RSI }), d => hasVal(d.RSI));
    } else if (seriesRef.current.rsi) {
      chart.removeSeries(seriesRef.current.rsi);
      delete seriesRef.current.rsi;
    }

    if (indicators.breakoutProb) {
      if (!seriesRef.current.breakoutProb) {
        seriesRef.current.breakoutProb = chart.addAreaSeries({
          topColor: 'rgba(244, 114, 182, 0.3)',
          bottomColor: 'rgba(244, 114, 182, 0.0)',
          lineColor: '#f472b6',
          lineWidth: 2,
          title: 'Breakout Prob Expo',
          priceScaleId: 'breakout-pane',
        });
        chart.priceScale('breakout-pane').applyOptions({
          scaleMargins: { top: 0.82, bottom: 0 },
          borderVisible: false,
        });
      }
      updateOrSet('breakoutProb', (d, i) => ({ time: timestamps[i], value: d.Breakout_Prob }), d => hasVal(d.Breakout_Prob));
    } else if (seriesRef.current.breakoutProb) {
      chart.removeSeries(seriesRef.current.breakoutProb);
      delete seriesRef.current.breakoutProb;
    }

    if (indicators.strategyZP) {
      if (!seriesRef.current.strategyZPStrength) {
        seriesRef.current.strategyZPStrength = chart.addHistogramSeries({
          color: 'rgba(168, 85, 247, 0.55)',
          priceScaleId: 'strategy-pane',
          title: 'ZP Strength',
        });
        chart.priceScale('strategy-pane').applyOptions({
          scaleMargins: { top: 0.72, bottom: 0.12 },
          borderVisible: false,
        });
      }
      seriesRef.current.strategyZPStrength.setData(data.map((d, i) => {
        const signal = d.ZP_Strategy_Signal || 0;
        return {
          time: timestamps[i],
          value: d.ZP_Strategy_Strength || 0,
          color: signal === 1
            ? 'rgba(0, 208, 156, 0.45)'
            : signal === -1
              ? 'rgba(235, 91, 60, 0.45)'
              : 'rgba(148, 163, 184, 0.18)',
        };
      }));
    } else if (seriesRef.current.strategyZPStrength) {
      chart.removeSeries(seriesRef.current.strategyZPStrength);
      delete seriesRef.current.strategyZPStrength;
    }

    if (indicators.volume) {
      if (!seriesRef.current.volume) {
        seriesRef.current.volume = chart.addHistogramSeries({ color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: '' });
        seriesRef.current.volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      }
      seriesRef.current.volume.setData(data.map((d, i) => ({
        time: timestamps[i],
        value: d.Volume,
        color: d.Close >= d.Open ? 'rgba(0, 208, 156, 0.3)' : 'rgba(235, 91, 60, 0.3)',
      })));
    } else if (seriesRef.current.volume) {
      chart.removeSeries(seriesRef.current.volume);
      delete seriesRef.current.volume;
    }

    // --- Combined Markers Rendering ---
    if (seriesRef.current.candles) {
      const markers = [];
      
      data.forEach((d, i) => {
        const time = timestamps[i];
        
        // ZP Strategy Markers
        if (indicators.strategyZP) {
          if (d.ZP_Strategy_Signal === 1) {
            markers.push({ time, position: 'belowBar', color: '#00D09C', shape: 'arrowUp', text: 'ZP BUY' });
          } else if (d.ZP_Strategy_Signal === -1) {
            markers.push({ time, position: 'aboveBar', color: '#EB5B3C', shape: 'arrowDown', text: 'ZP SELL' });
          }
        }
        
        // SPECTRA Markers (Cross signals)
        if (indicators.spectra) {
          if (d.SPECTRA_Cross === 1) {
            markers.push({ time, position: 'belowBar', color: '#ec4899', shape: 'circle', text: 'S.BUY' });
          } else if (d.SPECTRA_Cross === -1) {
            markers.push({ time, position: 'aboveBar', color: '#ec4899', shape: 'circle', text: 'S.SELL' });
          }
        }
      });
      
      seriesRef.current.candles.setMarkers(markers.sort((a, b) => a.time - b.time));
    }

    // AI Predictions
    if (predictions.length > 0) {
      if (!seriesRef.current.predictions) {
        seriesRef.current.predictions = chart.addLineSeries({
          color: '#c084fc',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          title: 'AI Predict',
        });
      }
      const lastPoint = {
        time: timestamps[timestamps.length - 1],
        value: data[data.length - 1].Close
      };
      const predData = [
        lastPoint,
        ...predictions.map(p => ({
          time: Math.floor(new Date(p.Date).getTime() / 1000),
          value: p.Predicted_Close
        }))
      ];
      seriesRef.current.predictions.setData(predData);
    } else if (seriesRef.current.predictions) {
      chart.removeSeries(seriesRef.current.predictions);
      delete seriesRef.current.predictions;
    }

  }, [data, predictions, indicators, ticker, timeframe]);


  return (
    <div className="relative w-full h-full min-h-[500px]">
      <ChartLegend />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm z-50 rounded-2xl">
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
};

export default TradingChart;
