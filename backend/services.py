import yfinance as yf
import pandas as pd
import numpy as np
import math

def clean_float(val):
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return 0
        return f
    except:
        return 0
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestClassifier
import warnings
import json
import os
import time

warnings.filterwarnings("ignore")

from .cache import stock_cache, search_cache, trending_cache
import difflib
import requests


def yf_ticker(symbol):
    return yf.Ticker(symbol)


def yf_download(*args, **kwargs):
    # Modern yfinance manages its own curl_cffi session. Passing requests.Session
    # raises "Yahoo API requires curl_cffi session" on current versions.
    kwargs.pop("session", None)
    return yf.download(*args, **kwargs)


def extract_download_history(data, ticker, multi_ticker=False):
    if data is None or data.empty:
        return pd.DataFrame()
    if not isinstance(data.columns, pd.MultiIndex):
        return data.dropna(subset=["Close"]) if "Close" in data.columns else pd.DataFrame()

    try:
        if multi_ticker and ticker in data.columns.get_level_values(0):
            return data[ticker].dropna(subset=["Close"])
    except Exception:
        pass

    try:
        if multi_ticker and ticker in data.columns.get_level_values(1):
            return data.xs(ticker, axis=1, level=1).dropna(subset=["Close"])
    except Exception:
        pass

    return pd.DataFrame()

# Simple Cache Storage
_stock_cache = {}
CACHE_TTL = 3600 # 1 hour cache for historical data stability
_info_cache = {} # Separate cache for Ticker.info as it's the slowest part
INFO_CACHE_TTL = 600 # 10 minutes for info

STOCKS_FILE = os.path.join(os.path.dirname(__file__), "stocks.json")

def load_popular_stocks():
    try:
        with open(STOCKS_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading stocks.json: {e}")
        return {}

POPULAR_STOCKS = load_popular_stocks()

def get_popular_stocks():
    # Return a flattened list for easier frontend consumption
    all_stocks = []
    for cat, stocks in POPULAR_STOCKS.items():
        for s in stocks:
            s_copy = s.copy()
            s_copy['category'] = cat
            all_stocks.append(s_copy)
    return all_stocks

def get_trending_stocks_service():
    """
    Returns trending stocks. Uses cache to avoid hitting APIs too often.
    """
    cached = trending_cache.get("global_trending")
    if cached:
        return cached, None

    # Logic to identify trending: For now, we take some high-volume ones from POPULAR_STOCKS
    # and maybe some US movers.
    trending = []
    try:
        # Mix of Indian and US
        sources = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "AAPL", "TSLA", "NVDA", "BTC-USD"]
        for s in sources:
            ticker_obj = yf_ticker(s)
            info = ticker_obj.fast_info
            trending.append({
                "ticker": s,
                "name": s.replace(".NS", ""),
                "price": round(info.get("last_price", 0), 2),
                "change": round(((info.get("last_price", 0) - info.get("previous_close", 1)) / info.get("previous_close", 1)) * 100, 2),
                "exchange": "NSE" if ".NS" in s else "NASDAQ"
            })
        
        trending_cache.set("global_trending", trending)
        return trending, None
    except Exception as e:
        print(f"Trending fetch error: {e}")
        # Fallback to hardcoded list if API fails
        return [
            {"ticker": "RELIANCE.NS", "name": "Reliance", "change": 1.2, "exchange": "NSE"},
            {"ticker": "AAPL", "name": "Apple", "change": -0.5, "exchange": "NASDAQ"},
            {"ticker": "TSLA", "name": "Tesla", "change": 2.4, "exchange": "NASDAQ"}
        ], None


def get_stock_data_service(ticker, period='2y', interval='1d'):
    # Normalize Ticker Input
    ticker = ticker.strip().upper().replace(" ", "")
    
    # Precise Interval & Period Mapping for Institutional Grade Control
    # Only override period if it's the default '2y' or not provided
    mapping = {
        '1m': ('1m', '7d'),
        '2m': ('2m', '60d'),
        '3m': ('2m', '60d'),
        '5m': ('5m', '60d'),
        '10m': ('5m', '60d'),
        '15m': ('15m', '60d'),
        '30m': ('30m', '60d'),
        '1h': ('1h', '2y'),
        '1H': ('1h', '2y'),
        '1d': ('1d', 'max'),
        '1D': ('1d', 'max'),
        '1wk': ('1wk', 'max'),
        '1mo': ('1mo', 'max'),
    }

    if interval in mapping:
        yf_interval, yf_period = mapping[interval]
        # Use requested period if it's NOT the default '2y', else use mapping's suggested period
        if period == '2y' or not period:
            period = yf_period
        interval = yf_interval

    # Candidate Resolution Logic
    candidates = [ticker]
    
    # 1. Direct POPULAR_STOCKS Name/Ticker Lookup (Intelligent Fuzzy)
    found_match = False
    search_term = ticker.upper()
    
    for category, stocks in POPULAR_STOCKS.items():
        for s in stocks:
            # Match by Ticker (Full or Start), Name (Full or Start)
            if (s["ticker"].upper().startswith(search_term) or 
                s["name"].upper().startswith(search_term) or
                search_term in s["name"].upper()):
                candidates.insert(0, s["ticker"])
                found_match = True
                break
        if found_match: break

    if not any(x in ticker for x in ['.', '-', '^']):
        candidates.append(f"{ticker}.NS")
        candidates.append(f"{ticker}-USD")
        candidates.append(f"{ticker}.BO")
    
    # Always have a safe fallback in candidates list to ensure ZERO errors
    featured_fallback = "RELIANCE.NS" if "." not in ticker else "AAPL"
    candidates.append(featured_fallback)

    cache_key = f"{ticker}_{period}_{interval}"
    cached_data = stock_cache.get(cache_key)
    if cached_data:
        return cached_data, None

    df = pd.DataFrame()
    resolved_ticker = ticker
    is_discovery = False

    # Attempt fetching candidates
    for i, cand in enumerate(candidates):
        try:
            # Simple download without group_by to avoid MultiIndex complexity
            df = yf_download(cand, period=period, interval=interval, progress=False)
            
            # Handle possible MultiIndex (sometimes happens with yfinance)
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            if not df.empty and len(df) > 0:
                resolved_ticker = cand
                # Check if we are using the last-resort fallback
                if cand == featured_fallback and i == len(candidates) - 1:
                    is_discovery = True
                break
        except Exception as e:
            print(f"Search candidate {cand} failed: {e}")
            continue

    # Absolute safety fallback if even the featured asset fails (e.g. Network issue)
    if df.empty:
        return None, "Market data servers are currently unreachable. Please try again in a moment."

    try:
        df.index = pd.to_datetime(df.index)
        df = df.sort_index()

        # Indicators with safety checks
        close_prices = df['Close']
        df['EMA_20'] = close_prices.ewm(span=20, adjust=False).mean()
        df['EMA_50'] = df['Close'].ewm(span=50, adjust=False).mean()
        df['EMA_200'] = df['Close'].ewm(span=200, adjust=False).mean()

        # MACD Calculation
        exp12 = df['Close'].ewm(span=12, adjust=False).mean()
        exp26 = df['Close'].ewm(span=26, adjust=False).mean()
        df['MACD'] = exp12 - exp26
        df['MACD_Signal'] = df['MACD'].ewm(span=9, adjust=False).mean()
        df['MACD_Hist'] = df['MACD'] - df['MACD_Signal']

        # RSI Calculation
        delta = df['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss.replace(0, np.nan)
        df['RSI'] = 100 - (100 / (1 + rs.fillna(0)))

        df['MA20'] = df['Close'].rolling(window=20).mean()
        df['20SD'] = df['Close'].rolling(window=20).std()
        df['Upper_BB'] = df['MA20'] + (df['20SD'] * 2)
        df['Lower_BB'] = df['MA20'] - (df['20SD'] * 2)

        # VWAP Calculation (with Zero-Volume Safety)
        df['Typical_Price'] = (df['High'] + df['Low'] + df['Close']) / 3
        vol_sum = df['Volume'].cumsum()
        df['VWAP'] = np.where(vol_sum > 0, (df['Volume'] * df['Typical_Price']).cumsum() / vol_sum, df['Close'])

        # Fill gaps and handle edge cases
        critical_cols = ['Open', 'High', 'Low', 'Close', 'EMA_20', 'EMA_50', 'EMA_200', 'VWAP', 'Upper_BB', 'Lower_BB', 'RSI']
        for col in critical_cols:
            if col in df.columns:
                df[col] = df[col].ffill().bfill().fillna(0)
        
        df = df.replace([np.inf, -np.inf], 0)
        
        # Fibonacci Retracement Levels (from recent min/max)
        if len(df) > 0 and not df['High'].isna().all():
            recent_high = float(df['High'].max())
            recent_low = float(df['Low'].min())
            diff = recent_high - recent_low
            fibo = {
                "0": round(recent_high, 2),
                "23.6": round(recent_high - 0.236 * diff, 2),
                "38.2": round(recent_high - 0.382 * diff, 2),
                "50.0": round(recent_high - 0.5 * diff, 2),
                "61.8": round(recent_high - 0.618 * diff, 2),
                "100": round(recent_low, 2)
            }
        else:
            fibo = {}

        # RF Signals (Random Forest)
        df['RF_Signal'] = 0
        if len(df) > 100:
            try:
                # Features for ML
                features = ['Close', 'Volume', 'EMA_20', 'RSI', 'MACD']
                train_data = df.copy()
                # Target: 1 if next close is higher than current close, else 0
                train_data['Target'] = (train_data['Close'].shift(-1) > train_data['Close']).astype(int)
                train_data = train_data.dropna()
                
                X_rf = train_data[features]
                y_rf = train_data['Target']
                
                rf = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
                rf.fit(X_rf, y_rf)
                
                # Predict for the whole dataset
                rf_preds = rf.predict(df[features].fillna(0))
                rf_probs = rf.predict_proba(df[features].fillna(0))
                
                # Create signals based on confidence
                # Buy signal if prob > 0.65, Sell if prob < 0.35
                signals = []
                for p in rf_probs:
                    if p[1] > 0.65:
                        signals.append(1)  # Buy
                    elif p[1] < 0.35:
                        signals.append(-1) # Sell
                    else:
                        signals.append(0)
                df['RF_Signal'] = signals
                df['RF_Confidence'] = [round(float(max(p)*100), 2) for p in rf_probs]
            except Exception as e:
                print("RF Model error:", e)
                df['RF_Confidence'] = 50.0

        # --- NEW INDICATOR: Breakout Probability Expo ---
        try:
            # 1. Volatility Squeeze (BB Width)
            df['BB_Width'] = (df['Upper_BB'] - df['Lower_BB']) / df['MA20']
            # 2. Volume Spike
            df['Vol_MA'] = df['Volume'].rolling(window=20).mean()
            df['Vol_Ratio'] = df['Volume'] / df['Vol_MA']
            # 3. Proximity to 20-day High/Low
            df['High_20'] = df['High'].rolling(window=20).max()
            df['Low_20'] = df['Low'].rolling(window=20).min()
            
            # Breakout Prob Calculation (Heuristic)
            # Higher probability if: Squeeze is tight, Volume is rising, and price is near High_20 or Low_20
            squeeze_factor = (1 - (df['BB_Width'] / df['BB_Width'].rolling(window=50).mean())).clip(0, 1)
            vol_factor = (df['Vol_Ratio'] / 2).clip(0, 1)
            prox_high = (1 - (df['High_20'] - df['Close']) / (df['High_20'] * 0.02)).clip(0, 1)
            prox_low = (1 - (df['Close'] - df['Low_20']) / (df['Low_20'] * 0.02)).clip(0, 1)
            
            df['Breakout_Prob'] = ((squeeze_factor * 0.4 + vol_factor * 0.3 + np.maximum(prox_high, prox_low) * 0.3) * 100).fillna(0)
            df['Breakout_Prob'] = df['Breakout_Prob'].clip(0, 100).round(2)
        except Exception as e:
            print("Breakout Prob error:", e)
            df['Breakout_Prob'] = 0

        # --- NEW INDICATOR: SPECTRA Signal Processing Engine (by SentioEdge / Ehlers inspired) ---
        try:
            # SuperSmoother Filter (recursive, using loop for precision)
            def super_smoother(prices, period):
                import math
                a1 = math.exp(-1.414 * 3.14159 / period)
                b1 = 2 * a1 * math.cos(1.414 * 3.14159 / period)
                c2 = b1
                c3 = -a1 * a1
                c1 = 1 - c2 - c3
                
                res = np.zeros_like(prices)
                for i in range(len(prices)):
                    if i < 2:
                        res[i] = prices[i]
                    else:
                        res[i] = c1 * (prices[i] + prices[i-1]) / 2 + c2 * res[i-1] + c3 * res[i-2]
                return res

            df['SPECTRA_Filt'] = super_smoother(df['Close'].values, 10)
            df['SPECTRA_Mom'] = df['SPECTRA_Filt'].diff(2)
            
            # Signal: 1 (Buy) when Mom > 0, -1 (Sell) when Mom < 0
            df['SPECTRA_Signal'] = np.where(df['SPECTRA_Mom'] > 0, 1, -1)
            # Add a "Cross" signal for markers
            df['SPECTRA_Cross'] = 0
            df.loc[(df['SPECTRA_Signal'] == 1) & (df['SPECTRA_Signal'].shift(1) == -1), 'SPECTRA_Cross'] = 1
            df.loc[(df['SPECTRA_Signal'] == -1) & (df['SPECTRA_Signal'].shift(1) == 1), 'SPECTRA_Cross'] = -1
        except Exception as e:
            print("SPECTRA error:", e)
            df['SPECTRA_Filt'] = df['Close']
            df['SPECTRA_Signal'] = 0
            df['SPECTRA_Cross'] = 0

        # --- NEW INDICATOR: LuxAlgo Support & Resistance (Pivot Based) ---
        try:
            lookback = 15
            df['Pivot_H'] = df['High'].rolling(window=lookback*2+1, center=True).max()
            df['Pivot_L'] = df['Low'].rolling(window=lookback*2+1, center=True).min()
            
            # Extract pivots
            ph = np.where(df['High'] == df['Pivot_H'], df['High'], np.nan)
            pl = np.where(df['Low'] == df['Pivot_L'], df['Low'], np.nan)
            
            # Forward fill the last known pivot to create levels
            df['Lux_Resist'] = pd.Series(ph).ffill()
            df['Lux_Support'] = pd.Series(pl).ffill()
            
            # ATR for zone calculation
            df['TR'] = np.maximum(df['High'] - df['Low'], 
                       np.maximum(abs(df['High'] - df['Close'].shift(1)), 
                                 abs(df['Low'] - df['Close'].shift(1))))
            df['ATR'] = df['TR'].rolling(window=14).mean()
            
            # Zones
            df['Lux_Resist_Zone'] = df['Lux_Resist'] + (df['ATR'] * 0.5)
            df['Lux_Support_Zone'] = df['Lux_Support'] - (df['ATR'] * 0.5)
            
        except Exception as e:
            print("LuxAlgo S/R error:", e)
            df['Lux_Resist'] = None
            df['Lux_Support'] = None

        # --- NEW INDICATOR: DIY Custom Strategy Builder ZP ---
        # A composite "Zero Pitch" strategy: Trend (EMA) + Momentum (RSI) + Volume Confirmation
        try:
            # Trend component
            df['Trend_Alignment'] = np.where((df['Close'] > df['EMA_20']) & (df['EMA_20'] > df['EMA_50']), 1, 
                                    np.where((df['Close'] < df['EMA_20']) & (df['EMA_20'] < df['EMA_50']), -1, 0))
            # Momentum component
            df['Mom_Alignment'] = np.where(df['RSI'] > 60, 1, np.where(df['RSI'] < 40, -1, 0))
            
            # Strategy Signal: 1 (Buy), -1 (Sell), 0 (Neutral)
            # Only trigger if Trend and Momentum align with Volume support
            df['ZP_Strategy_Signal'] = np.where((df['Trend_Alignment'] == 1) & (df['Mom_Alignment'] == 1) & (df['Vol_Ratio'] > 1.1), 1,
                                       np.where((df['Trend_Alignment'] == -1) & (df['Mom_Alignment'] == -1) & (df['Vol_Ratio'] > 1.1), -1, 0))
            
            # Strategy Strength (0-100)
            df['ZP_Strategy_Strength'] = ((df['RSI'] / 100).abs() * 100).round(2)
        except Exception as e:
            print("ZP Strategy error:", e)
            df['ZP_Strategy_Signal'] = 0
            df['ZP_Strategy_Strength'] = 0

        df.reset_index(inplace=True)
        if 'Datetime' in df.columns:
            df.rename(columns={'Datetime': 'Date'}, inplace=True)
        elif 'index' in df.columns:
            df.rename(columns={'index': 'Date'}, inplace=True)
            
        df['Date'] = pd.to_datetime(df['Date'], utc=True).dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        # Regression
        pred_data = []
        if len(df) > 60:
            train_df = df.tail(60).copy()
            X = np.arange(len(train_df)).reshape(-1, 1)
            y = train_df['Close'].values
            
            model = LinearRegression()
            model.fit(X, y)
            
            future_X = np.arange(len(train_df), len(train_df) + 5).reshape(-1, 1)
            predictions = model.predict(future_X)
            
            last_date = pd.to_datetime(df['Date'].iloc[-1])
            
            if interval.endswith('m'):
                step_val = int(interval.replace('m', ''))
                future_dates = [(last_date + pd.Timedelta(minutes=step_val*i)).strftime('%Y-%m-%dT%H:%M:%SZ') for i in range(1, 6)]
            elif interval.endswith('h'):
                step_val = int(interval.replace('h', ''))
                future_dates = [(last_date + pd.Timedelta(hours=step_val*i)).strftime('%Y-%m-%dT%H:%M:%SZ') for i in range(1, 6)]
            elif interval.endswith('wk'):
                step_val = int(interval.replace('wk', ''))
                future_dates = [(last_date + pd.Timedelta(weeks=step_val*i)).strftime('%Y-%m-%dT%H:%M:%SZ') for i in range(1, 6)]
            elif interval.endswith('mo'):
                step_val = int(interval.replace('mo', ''))
                future_dates = [(last_date + pd.DateOffset(months=step_val*i)).strftime('%Y-%m-%dT%H:%M:%SZ') for i in range(1, 6)]
            else:
                future_dates = [(last_date + pd.Timedelta(days=i)).strftime('%Y-%m-%dT%H:%M:%SZ') for i in range(1, 6)]
            
            pred_data = [{"Date": d, "Predicted_Close": round(float(p), 2)} for d, p in zip(future_dates, predictions)]

        df = df.replace([np.inf, -np.inf, np.nan], None)
        
        def smart_round(val):
            if val is None: return None
            try:
                v = float(val)
                if v == 0: return 0
                if abs(v) < 0.01: return round(v, 6)
                if abs(v) < 1: return round(v, 4)
                return round(v, 2)
            except: return val

        # Prune columns to only what's needed by the frontend (Reduced payload size by ~60%)
        keep_cols = [
            'Date', 'Open', 'High', 'Low', 'Close', 'Volume', 
            'EMA_20', 'EMA_50', 'EMA_200', 'MACD', 'MACD_Signal', 'MACD_Hist', 
            'RSI', 'Upper_BB', 'Lower_BB', 'VWAP', 'RF_Signal', 'RF_Confidence',
            'Breakout_Prob', 'ZP_Strategy_Signal', 'ZP_Strategy_Strength',
            'SPECTRA_Filt', 'SPECTRA_Signal', 'SPECTRA_Cross',
            'Lux_Resist', 'Lux_Support', 'Lux_Resist_Zone', 'Lux_Support_Zone'
        ]
        df = df[[c for c in keep_cols if c in df.columns]]
        
        records = df.to_dict(orient='records')
        
        # Optimized Info Retrieval
        info = {}
        if resolved_ticker in _info_cache:
            cached_info, timestamp = _info_cache[resolved_ticker]
            if time.time() - timestamp < INFO_CACHE_TTL:
                info = cached_info

        if not info:
            ticker_obj = yf_ticker(resolved_ticker)
            try:
                # Use fast_info if available, else standard info
                if hasattr(ticker_obj, 'fast_info'):
                    f_info = ticker_obj.fast_info
                    info = {
                        "shortName": resolved_ticker,
                        "currentPrice": f_info.get("last_price", 0),
                        "previousClose": f_info.get("previous_close", 0),
                        "marketCap": f_info.get("market_cap", 0),
                        "volume": f_info.get("last_volume", 0),
                        "currency": f_info.get("currency", "USD")
                    }
                else:
                    info = ticker_obj.info
                _info_cache[resolved_ticker] = (info, time.time())
            except:
                info = {}
            
        company_info = {
            "name": info.get("shortName", resolved_ticker),
            "sector": info.get("sector", "N/A"),
            "industry": info.get("industry", "N/A"),
            "summary": info.get("longBusinessSummary", ""),
            "currentPrice": clean_float(info.get("currentPrice", 0) or info.get("previousClose", 0)),
            "regularMarketChangePercent": clean_float(info.get("regularMarketChangePercent", 0)),
            "previousClose": clean_float(info.get("previousClose", 0)),
            "open": clean_float(info.get("open", 0)),
            "dayLow": clean_float(info.get("dayLow", 0)),
            "dayHigh": clean_float(info.get("dayHigh", 0)),
            "fiftyTwoWeekLow": clean_float(info.get("fiftyTwoWeekLow", 0)),
            "fiftyTwoWeekHigh": clean_float(info.get("fiftyTwoWeekHigh", 0)),
            "volume": int(clean_float(info.get("volume", 0))),
            "marketCap": int(clean_float(info.get("marketCap", 0))),
            "currency": info.get("currency", "USD")
        }

        # Fallback for missing info fields from historical data
        if not df.empty:
            last_row = df.iloc[-1]
            if company_info["currentPrice"] == 0:
                company_info["currentPrice"] = float(last_row["Close"])
            if company_info["open"] == 0:
                company_info["open"] = float(last_row["Open"])
            
            if len(df) > 1:
                prev_row = df.iloc[-2]
                if company_info["previousClose"] == 0:
                    company_info["previousClose"] = float(prev_row["Close"])
                
                if company_info["regularMarketChangePercent"] == 0:
                    price = company_info["currentPrice"]
                    prev = company_info["previousClose"]
                    if prev != 0:
                        company_info["regularMarketChangePercent"] = ((price - prev) / prev) * 100
            
            # Use last 24h/session for high/low if missing
            if company_info["dayLow"] == 0: company_info["dayLow"] = float(last_row["Low"])
            if company_info["dayHigh"] == 0: company_info["dayHigh"] = float(last_row["High"])
            if company_info["volume"] == 0: company_info["volume"] = int(last_row.get("Volume", 0))

        # Analytical Insights Calculation
        trend = "Neutral"
        recommendation = "Hold"
        confidence = 50
        
        if not df.empty:
            last_row = df.iloc[-1]
            close = float(last_row['Close'])
            ema20 = float(last_row.get('EMA_20', close))
            ema50 = float(last_row.get('EMA_50', close))
            rsi = float(last_row.get('RSI', 50))
            
            # Trend Logic
            if close > ema20 and ema20 > ema50:
                trend = "Bullish"
            elif close < ema20 and ema20 < ema50:
                trend = "Bearish"
            
            # Recommendation Logic
            buy_score = 0
            sell_score = 0
            
            # RSI Signals
            if rsi < 30: buy_score += 2
            elif rsi < 45: buy_score += 1
            if rsi > 70: sell_score += 2
            elif rsi > 55: sell_score += 1
            
            # EMA Signals
            if close > ema20: buy_score += 1
            else: sell_score += 1
            
            if ema20 > ema50: buy_score += 1
            else: sell_score += 1
            
            # Final Decision
            if buy_score > sell_score:
                recommendation = "Strong Buy" if buy_score >= 3 else "Buy"
                confidence = int((buy_score / 4) * 100)
            elif sell_score > buy_score:
                recommendation = "Strong Sell" if sell_score >= 3 else "Sell"
                confidence = int((sell_score / 4) * 100)
            else:
                recommendation = "Hold"
                confidence = 50

        company_info.update({
            "trend": trend,
            "recommendation": recommendation,
            "confidence": confidence,
            "targetPrice": pred_data[-1]["Predicted_Close"] if pred_data else None,
            "fibonacci": fibo
        })

        result = {
            "ticker": resolved_ticker,
            "info": company_info,
            "data": records,
            "predictions": pred_data,
            "is_discovery": is_discovery,
            "original_search": ticker
        }
        
        # Store in cache
        stock_cache.set(cache_key, result)

        return result, None

    except Exception as e:
        print(f"Error fetching data: {e}")
        return None, str(e)

def _parse_article(article):
    """
    Parse a yfinance news article.
    Current format (2025+): top-level has 'id', data lives in 'content' key.
    content has: title, summary, pubDate, provider{displayName}, 
                 clickThroughUrl{url}, canonicalUrl{url}, thumbnail{resolutions[]}
    Legacy format: flat dict with title, link, publisher, providerPublishTime.
    """
    data = article.get("content", article)

    title = data.get("title", "") or article.get("title", "")
    
    # Link: prefer clickThroughUrl, fall back to canonicalUrl, then link
    link = (
        (data.get("clickThroughUrl") or {}).get("url") or
        (data.get("canonicalUrl") or {}).get("url") or
        data.get("link", "")
    )

    # Timestamp
    publish_time = data.get("pubDate", data.get("providerPublishTime", data.get("displayTime", 0)))

    # Publisher: new format uses 'provider', old uses 'publisher'
    provider = data.get("provider") or data.get("publisher") or {}
    if isinstance(provider, dict):
        pub = provider.get("displayName", provider.get("name", ""))
    else:
        pub = str(provider)

    # Thumbnail: resolutions list in thumbnail dict
    thumbnail = ""
    thumb = data.get("thumbnail")
    if isinstance(thumb, dict):
        resolutions = thumb.get("resolutions", [])
        if resolutions:
            # Pick the smallest usable thumbnail (index 1) or last one
            t = resolutions[1] if len(resolutions) > 1 else resolutions[0]
            thumbnail = t.get("url", "")
    elif isinstance(thumb, str):
        thumbnail = thumb

    # For legacy flat format, also check direct thumbnail key
    if not thumbnail and "thumbnail" not in data and "thumbnail" in article:
        t = article["thumbnail"]
        if isinstance(t, dict):
            res = t.get("resolutions", [])
            if res:
                thumbnail = res[0].get("url", "")
        elif isinstance(t, str):
            thumbnail = t

    return {
        "title": title,
        "publisher": pub,
        "link": link,
        "providerPublishTime": publish_time,
        "thumbnail": thumbnail,
        "summary": data.get("summary", data.get("description", ""))
    }

def get_stock_news_service(ticker):
    cache_key = f"news_{ticker}"
    cached = stock_cache.get(cache_key, ttl=1800)  # 30 min news cache
    if cached:
        return cached, None

    try:
        ticker_obj = yf_ticker(ticker)
        try:
            raw_news = ticker_obj.news or []
        except Exception:
            raw_news = []

        if not raw_news:
            # Fallback: general market news
            return get_general_news_service()

        formatted_news = [_parse_article(a) for a in raw_news[:8]]
        # Drop articles with no title
        formatted_news = [a for a in formatted_news if a["title"]]

        if not formatted_news:
            return get_general_news_service()

        result = {"ticker": ticker, "news": formatted_news}
        stock_cache.set(cache_key, result)
        return result, None
    except Exception:
        return get_general_news_service()

def quote_currency_for_summary(symbol: str) -> str:
    """Quote/trading currency for Yahoo Finance symbols in the global overview."""
    s = (symbol or "").upper()
    # Indian equity indices (caret tickers are not .NS / .BO)
    if s in ("^NSEI", "^BSESN"):
        return "INR"
    if s.endswith(".NS") or s.endswith(".BO"):
        return "INR"
    # USD/INR spot — quote shown in INR terms in the UI
    if "USDINR" in s:
        return "INR"
    # Major US indices
    if s in ("^IXIC", "^GSPC", "^DJI"):
        return "USD"
    # Other common indices (Yahoo quotes these in local CCY)
    if s == "^FTSE":
        return "GBP"
    if s == "^N225":
        return "JPY"
    return "USD"


def get_market_summary_service():
    try:
        symbols_dict = {
            "NIFTY 50": "^NSEI",
            "SENSEX": "^BSESN",
            "NASDAQ": "^IXIC",
            "S&P 500": "^GSPC",
            "DOW JONES": "^DJI",
            "FTSE 100": "^FTSE",
            "NIKKEI 225": "^N225",
            "USD/INR": "USDINR=X"
        }
        
        summary_data = []
        for name, symbol in symbols_dict.items():
            price, change, sparkline = 0, 0, []
            try:
                # Fetch slightly more data for a smoother sparkline
                ticker_obj = yf_ticker(symbol)
                ticker_data = ticker_obj.history(period="5d", interval="1h")
                if not ticker_data.empty:
                    prices = ticker_data['Close'].dropna().tolist()
                    if len(prices) >= 2:
                        price = float(prices[-1])
                        prev_price = float(prices[0]) # Start of the 5d period
                        change = ((price - prev_price) / prev_price) * 100
                        # Downsample sparkline to ~20 points for performance
                        step = max(1, len(prices) // 20)
                        sparkline = [round(float(p), 2) for p in prices[::step]]
                    elif len(prices) > 0:
                        price = float(prices[-1])
            except Exception as e:
                print(f"Error fetching {symbol}: {e}")
                
            summary_data.append({
                "name": name,
                "symbol": symbol,
                "price": round(clean_float(price), 2),
                "changePercent": round(clean_float(change), 2),
                "sparkline": sparkline,
                "currency": quote_currency_for_summary(symbol),
            })
        return {"summary": summary_data}, None
    except Exception as e:
        return {"summary": []}, str(e)

def get_top_movers_service():
    try:
        tickers = []
        for cat in ["Indian Market", "US Market"]:
            if cat in POPULAR_STOCKS:
                tickers.extend([s["ticker"] for s in POPULAR_STOCKS[cat]])
        
        tickers = tickers[:30]
        movers = []
        for t in tickers:
            try:
                ticker_obj = yf_ticker(t)
                hist = ticker_obj.history(period="2d")
                if hist.empty or len(hist) < 2:
                    hist = ticker_obj.history(period="7d")
                    
                if not hist.empty and len(hist) >= 2:
                    price = hist['Close'].iloc[-1]
                    prev_price = hist['Close'].iloc[-2]
                    change = ((price - prev_price) / prev_price) * 100
                    
                    movers.append({
                        "ticker": t,
                        "name": t.replace(".NS", ""),
                        "price": round(clean_float(price), 2),
                        "change": round(clean_float(change), 2),
                        "volume": int(clean_float(hist['Volume'].iloc[-1]))
                    })
                elif not hist.empty:
                    price = hist['Close'].iloc[-1]
                    movers.append({
                        "ticker": t,
                        "name": t.replace(".NS", ""),
                        "price": round(clean_float(price), 2),
                        "change": 0,
                        "volume": int(clean_float(hist['Volume'].iloc[-1]))
                    })
            except:
                continue
        
        gainers = sorted(movers, key=lambda x: x["change"], reverse=True)[:6]
        losers = sorted(movers, key=lambda x: x["change"])[:6]
        active = sorted(movers, key=lambda x: x["volume"], reverse=True)[:6]
        
        return {
            "gainers": gainers,
            "losers": losers,
            "active": active
        }, None
    except Exception as e:
        return {"gainers": [], "losers": [], "active": []}, str(e)

def get_sectors_service():
    try:
        sectors = {
            "NIFTY IT": "^CNXIT",
            "NIFTY BANK": "^NSEBANK",
            "NIFTY AUTO": "^CNXAUTO",
            "NIFTY PHARMA": "^CNXPHARMA",
            "NIFTY FMCG": "^CNXFMCG",
            "NIFTY METAL": "^CNXMETAL",
            "NIFTY REALTY": "^CNXREALTY",
            "NIFTY ENERGY": "^CNXENERGY",
            "NIFTY MEDIA": "^CNXMEDIA",
            "NIFTY PSU BANK": "^CNXPSUBANK",
            "NIFTY PVT BANK": "^NIFTYPVTBANK",
            "NIFTY FIN SERVICE": "^CNXFINANCE",
            "NIFTY INFRA": "^CNXINFRA",
            "NIFTY CONSUMPTION": "^CNXCONSUMPTION"
        }
        
        sector_data = []
        for name, symbol in sectors.items():
            change = 0.0
            try:
                ticker_obj = yf_ticker(symbol)
                hist = ticker_obj.history(period="5d")
                if len(hist) >= 2:
                    price = hist['Close'].iloc[-1]
                    prev_price = hist['Close'].iloc[-2]
                    if prev_price and clean_float(prev_price) != 0:
                        change = ((price - prev_price) / prev_price) * 100
            except:
                # Keep sector in response even if live data fetch fails.
                pass

            sector_data.append({
                "name": name,
                "change": round(clean_float(change), 2)
            })
        return {"sectors": sector_data}, None
    except Exception as e:
        return {"sectors": []}, str(e)

def get_market_category_service(category):
    try:
        stock_universe = load_popular_stocks() or POPULAR_STOCKS
        if category not in stock_universe:
            return None, "Category not found"
            
        assets = stock_universe[category]
        tickers = [a["ticker"] for a in assets]
        
        # Batch download for speed and reliability
        try:
            data = yf_download(tickers, period="5d", interval="1d", group_by='ticker', progress=False)
        except:
            data = pd.DataFrame()
            
        results = []
        for asset in assets:
            ticker = asset["ticker"]
            price, change, volume = 0, 0, 0
            try:
                ticker_df = extract_download_history(data, ticker, multi_ticker=len(tickers) > 1)
                if not ticker_df.empty:
                    price = ticker_df['Close'].iloc[-1]
                    if len(ticker_df) >= 2:
                        prev_price = ticker_df['Close'].iloc[-2]
                        change = ((price - prev_price) / prev_price) * 100 if prev_price else 0
                    volume = ticker_df['Volume'].iloc[-1] if 'Volume' in ticker_df else 0

                results.append({
                    "ticker": ticker,
                    "name": asset["name"],
                    "price": round(clean_float(price), 2),
                    "change": round(clean_float(change), 2),
                    "volume": int(clean_float(volume))
                })
            except Exception as e:
                print(f"Error processing {ticker}: {e}")
                results.append({
                    "ticker": ticker,
                    "name": asset["name"],
                    "price": 0, "change": 0, "volume": 0
                })
                
        return {"assets": results}, None
    except Exception as e:
        return {"assets": []}, str(e)

def get_general_news_service(category=None):
    cache_key = f"general_news_{category or 'global'}"
    cached = trending_cache.get(cache_key, ttl=1800)
    if cached:
        return cached, None

    try:
        sources = ["^NSEI", "^GSPC", "RELIANCE.NS", "AAPL", "MSFT", "GOOGL", "TCS.NS", "HDFCBANK.NS", "TSLA"]
        if category in ("Crypto", "Meme Coins"):
            sources = ["BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD", "COIN"] + sources
        elif category == "Forex":
            sources = ["USDINR=X", "EURUSD=X", "GBPUSD=X"] + sources
        elif category == "Indian Market":
            sources = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "^NSEI"]

        all_news = []
        for s in sources:
            try:
                raw = yf_ticker(s).news or []
                for a in raw[:4]:
                    formatted = _parse_article(a)
                    all_news.append(formatted)
            except:
                continue

        # Deduplicate by title
        seen_titles = set()
        unique = []
        for a in all_news:
            if a["title"] and a["title"] not in seen_titles:
                seen_titles.add(a["title"])
                unique.append(a)

        # Sort newest first
        unique.sort(key=lambda x: x.get("providerPublishTime", 0), reverse=True)
        formatted_news = unique[:15]

        result = {"news": formatted_news}
        trending_cache.set(cache_key, result)
        return result, None
    except Exception as e:
        return {"news": []}, str(e)


def search_stocks_service(query):
    query = query.strip().upper()
    
    # 1. Empty Query -> Return Trending
    if not query:
        trending, _ = get_trending_stocks_service()
        return {"results": [], "trending": trending}, None

    # 2. Local Cache Check
    cache_key = f"search_{query}"
    cached_res = search_cache.get(cache_key)
    if cached_res:
        return cached_res, None

    results = []
    seen_tickers = set()

    # 3. Enhanced Local Fuzzy Match
    all_known = []
    for cat, stocks in POPULAR_STOCKS.items():
        for s in stocks:
            all_known.append(s)

    matches = []
    for s in all_known:
        ticker = s["ticker"].upper()
        name = s["name"].upper()
        
        # Exact Ticker Match (Highest Priority)
        if ticker == query or ticker.split('.')[0] == query:
            matches.append((2.0, s))
            continue
            
        # Prefix Ticker Match
        if ticker.startswith(query):
            matches.append((1.5, s))
            continue
            
        # Name Match
        score = 0
        if query in name:
            score = 1.0 if name.startswith(query) else 0.8
        else:
            # Fuzzy name match for typos like "inosys"
            score = difflib.SequenceMatcher(None, query, name).ratio()
            
        if score > 0.5:
            matches.append((score, s))

    # Sort by score and add to results
    matches.sort(key=lambda x: x[0], reverse=True)
    for score, s in matches[:10]:
        if s["ticker"] not in seen_tickers:
            results.append({
                "ticker": s["ticker"],
                "name": s["name"],
                "exchange": "NSE" if ".NS" in s["ticker"] else ("BSE" if ".BO" in s["ticker"] else "NASDAQ"),
                "type": "Stock",
                "score": score
            })
            seen_tickers.add(s["ticker"])

    # 4. Global API Lookup (Yahoo Search)
    try:
        url = f"https://query2.finance.yahoo.com/v1/finance/search?q={query}&quotesCount=10&newsCount=0"
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(url, headers=headers, timeout=3)
        
        if response.status_code == 200:
            data = response.json()
            for quote in data.get("quotes", []):
                ticker = quote.get("symbol")
                if ticker and ticker not in seen_tickers:
                    # Prefer Indian stocks for Indian users if possible
                    score = 0.5
                    if ".NS" in ticker or ".BO" in ticker: score = 0.6
                    
                    results.append({
                        "ticker": ticker,
                        "name": quote.get("shortname", quote.get("longname", ticker)),
                        "exchange": quote.get("exchange", "Global"),
                        "type": quote.get("quoteType", "Equity"),
                        "score": score
                    })
                    seen_tickers.add(ticker)
    except Exception as e:
        print(f"Global search error: {e}")

    results.sort(key=lambda x: x.get('score', 0), reverse=True)
    final_results = {"results": results[:15]}
    search_cache.set(cache_key, final_results)
    return final_results, None


def _infer_market_type(symbol: str, quote_type: str | None = None, exchange: str | None = None):
    s = (symbol or "").upper()
    qt = (quote_type or "").upper()
    ex = (exchange or "").upper()
    if qt in ("CRYPTOCURRENCY", "CRYPTO") or s.endswith("-USD") or "CRYPTO" in ex:
        return "CRYPTO"
    if qt in ("CURRENCY", "FOREX") or s.endswith("=X") or "FX" in ex or "FOREX" in ex:
        return "FOREX"
    if s.startswith("^"):
        return "INDEX"
    if s.endswith(".NS") or ex in ("NSE", "NSI"):
        return "INDIA"
    if s.endswith(".BO") or ex in ("BSE",):
        return "INDIA"
    return "US" if ex in ("NYQ", "NMS", "NAS", "NYSE", "NASDAQ") else "GLOBAL"


def _get_cached_quote(symbol: str):
    symbol = (symbol or "").upper()
    if not symbol:
        return None
    cache_key = f"quote_{symbol}"
    cached = search_cache.get(cache_key, ttl=45)
    # If we cached an empty quote (price=0), treat as a miss so we can retry quickly.
    try:
        if cached and clean_float(cached.get("price", 0)) > 0:
            return cached
    except Exception:
        pass
    return None


def _set_cached_quote(symbol: str, quote: dict):
    symbol = (symbol or "").upper()
    if not symbol:
        return
    cache_key = f"quote_{symbol}"
    search_cache.set(cache_key, quote)


def _hydrate_quotes_fast(symbols: list[str]):
    """
    Best-effort fast quote hydration.
    Uses yfinance fast_info per symbol (cached) to avoid heavy calls.
    """
    out = {}
    for sym in (symbols or [])[:8]:
        s = (sym or "").upper()
        if not s:
            continue
        cached = _get_cached_quote(s)
        if cached:
            out[s] = cached
            continue
        try:
            t = yf_ticker(s)
            f = getattr(t, "fast_info", {}) or {}
            last_price = clean_float(f.get("last_price", 0))
            prev = clean_float(f.get("previous_close", 0)) or last_price or 0
            chg_pct = 0
            if prev:
                chg_pct = ((last_price - prev) / prev) * 100
            # Fallback if fast_info is empty/blocked
            if last_price == 0:
                try:
                    h = t.history(period="2d", interval="1d")
                    if not h.empty and len(h) >= 1:
                        last_price = clean_float(h["Close"].iloc[-1])
                        if len(h) >= 2:
                            prev = clean_float(h["Close"].iloc[-2]) or last_price
                        else:
                            prev = prev or last_price
                        if prev:
                            chg_pct = ((last_price - prev) / prev) * 100
                except Exception:
                    pass
            q = {
                "price": round(clean_float(last_price), 6),
                "changePercent": round(clean_float(chg_pct), 2),
                "currency": f.get("currency", "USD")
            }
            _set_cached_quote(s, q)
            out[s] = q
        except Exception:
            continue
    return out


def search_stocks_v2_service(query: str, limit: int = 20, offset: int = 0, with_quotes: bool = False):
    """
    Institutional-grade global search.
    - Uses local POPULAR universe + Yahoo finance search.
    - Supports pagination.
    - Optionally hydrates top results with cached price previews (best-effort).
    """
    q = (query or "").strip()
    q_up = q.upper()
    limit = max(1, min(int(limit or 20), 50))
    offset = max(0, int(offset or 0))

    if not q:
        trending, _ = get_trending_stocks_service()
        return {
            "results": [],
            "trending": trending,
            "meta": {"limit": limit, "offset": offset, "with_quotes": with_quotes}
        }, None

    cache_key = f"searchv2_{q_up}_{limit}_{offset}_{1 if with_quotes else 0}"
    cached = search_cache.get(cache_key)
    if cached:
        return cached, None

    results = []
    seen = set()

    # 1) Local fuzzy results (high confidence)
    local_data, _ = search_stocks_service(q)
    for item in (local_data or {}).get("results", []):
        sym = (item.get("ticker") or "").upper()
        if not sym or sym in seen:
            continue
        seen.add(sym)
        results.append({
            "symbol": sym,
            "name": item.get("name") or sym,
            "exchange": item.get("exchange") or "GLOBAL",
            "quoteType": item.get("type") or "EQUITY",
            "marketType": _infer_market_type(sym, item.get("type"), item.get("exchange")),
            "score": item.get("score", 0.6),
            "logoUrl": None,
            "sector": None,
        })

    # 2) Yahoo search (broad coverage)
    try:
        url = f"https://query2.finance.yahoo.com/v1/finance/search?q={q_up}&quotesCount=20&newsCount=0"
        headers = {"User-Agent": "Mozilla/5.0"}
        resp = requests.get(url, headers=headers, timeout=3)
        if resp.status_code == 200:
            payload = resp.json() or {}
            for quote in payload.get("quotes", []):
                sym = (quote.get("symbol") or "").upper()
                if not sym or sym in seen:
                    continue
                seen.add(sym)
                exchange = quote.get("exchange", quote.get("fullExchangeName", "Global"))
                qt = quote.get("quoteType", quote.get("typeDisp", "Equity"))
                results.append({
                    "symbol": sym,
                    "name": quote.get("shortname") or quote.get("longname") or sym,
                    "exchange": exchange,
                    "quoteType": qt,
                    "marketType": _infer_market_type(sym, qt, exchange),
                    "score": 0.5,
                    "logoUrl": quote.get("logoUrl"),
                    "sector": quote.get("sector"),
                })
    except Exception as e:
        print(f"search v2 yahoo error: {e}")

    # Sort by score, then symbol length (shorter symbols feel more "exact")
    results.sort(key=lambda r: (r.get("score", 0), -len(r.get("symbol", ""))), reverse=True)
    paged = results[offset: offset + limit]

    # Quote hydration (best effort, cached)
    if with_quotes and paged:
        quotes = _hydrate_quotes_fast([r["symbol"] for r in paged])
        for r in paged:
            qd = quotes.get(r["symbol"])
            if qd:
                r.update(qd)

    out = {"results": paged, "meta": {"limit": limit, "offset": offset, "with_quotes": with_quotes}}
    search_cache.set(cache_key, out)
    return out, None

