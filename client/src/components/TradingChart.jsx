import React, { useEffect, useRef } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import useStore from '../store/useStore';
import ChartLegend from './ChartLegend';

const TradingChart = () => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef({});
  
  const { data, predictions, indicators, loading } = useStore();

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

  useEffect(() => {
    if (!chartRef.current || !data.length) return;

    const chart = chartRef.current;
    
    // Clear existing series
    Object.values(seriesRef.current).forEach(s => chart.removeSeries(s));
    seriesRef.current = {};

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

    // 2. Indicators (Resilient Filtering)
    const hasVal = (v) => v !== null && v !== undefined;

    if (indicators.ema20) {
      const ema20 = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1.5, title: 'EMA 20' });
      ema20.setData(data.filter(d => hasVal(d.EMA_20)).map(d => ({
        time: Math.floor(new Date(d.Date).getTime() / 1000),
        value: d.EMA_20
      })));
      seriesRef.current.ema20 = ema20;
    }

    if (indicators.ema50) {
      const ema50 = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1.5, title: 'EMA 50' });
      ema50.setData(data.filter(d => hasVal(d.EMA_50)).map(d => ({
        time: Math.floor(new Date(d.Date).getTime() / 1000),
        value: d.EMA_50
      })));
      seriesRef.current.ema50 = ema50;
    }

    if (indicators.ema200) {
      const ema200 = chart.addLineSeries({ color: '#ef4444', lineWidth: 1.5, title: 'EMA 200' });
      ema200.setData(data.filter(d => hasVal(d.EMA_200)).map(d => ({
        time: Math.floor(new Date(d.Date).getTime() / 1000),
        value: d.EMA_200
      })));
      seriesRef.current.ema200 = ema200;
    }

    if (indicators.vwap) {
      const vwap = chart.addLineSeries({ color: '#06b6d4', lineWidth: 1, title: 'VWAP' });
      vwap.setData(data.filter(d => hasVal(d.VWAP) && d.VWAP !== 0).map(d => ({
        time: Math.floor(new Date(d.Date).getTime() / 1000),
        value: d.VWAP
      })));
      seriesRef.current.vwap = vwap;
    }

    if (indicators.bb) {
      const upper = chart.addLineSeries({ color: 'rgba(255,255,255,0.15)', lineWidth: 1, title: 'BB Upper' });
      const lower = chart.addLineSeries({ color: 'rgba(255,255,255,0.15)', lineWidth: 1, title: 'BB Lower' });
      upper.setData(data.filter(d => hasVal(d.Upper_BB) && d.Upper_BB !== 0).map(d => ({
        time: Math.floor(new Date(d.Date).getTime() / 1000),
        value: d.Upper_BB
      })));
      lower.setData(data.filter(d => hasVal(d.Lower_BB) && d.Lower_BB !== 0).map(d => ({
        time: Math.floor(new Date(d.Date).getTime() / 1000),
        value: d.Lower_BB
      })));
      seriesRef.current.bbUpper = upper;
      seriesRef.current.bbLower = lower;
    }

    if (indicators.rsi) {
      const rsi = chart.addLineSeries({ 
        color: '#c084fc', 
        lineWidth: 1.5, 
        title: 'RSI',
        priceScaleId: 'rsi-pane' 
      });
      chart.priceScale('rsi-pane').applyOptions({
        scaleMargins: { top: 0.1, bottom: 0.8 },
      });
      rsi.setData(data.filter(d => hasVal(d.RSI)).map(d => ({
        time: Math.floor(new Date(d.Date).getTime() / 1000),
        value: d.RSI
      })));
      seriesRef.current.rsi = rsi;
    }

    if (indicators.volume) {
      const volume = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      volume.priceScale().applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      volume.setData(data.map(d => ({
        time: Math.floor(new Date(d.Date).getTime() / 1000),
        value: d.Volume,
        color: d.Close >= d.Open ? 'rgba(0, 208, 156, 0.3)' : 'rgba(235, 91, 60, 0.3)',
      })));
      seriesRef.current.volume = volume;
    }

    // 3. AI Predictions
    if (predictions.length > 0) {
      const predSeries = chart.addLineSeries({
        color: '#c084fc',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        title: 'AI Predict',
      });
      
      const lastPoint = formattedData[formattedData.length - 1];
      const predData = [
        { time: lastPoint.time, value: lastPoint.close },
        ...predictions.map(p => ({
          time: Math.floor(new Date(p.Date).getTime() / 1000),
          value: p.Predicted_Close
        }))
      ];
      predSeries.setData(predData);
      seriesRef.current.predictions = predSeries;
    }

    chart.timeScale().fitContent();

  }, [data, predictions, indicators]);

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
