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
import warnings
import json
import os
import time

warnings.filterwarnings("ignore")

from .cache_manager import stock_cache, search_cache, trending_cache
import difflib
import requests

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
            ticker_obj = yf.Ticker(s)
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
    mapping = {
        '1m': ('1m', '7d'),
        '3m': ('2m', '60d'),
        '5m': ('5m', '60d'),
        '10m': ('5m', '60d'),
        '15m': ('15m', '60d'),
        '30m': ('30m', '60d'),
        '1h': ('1h', '730d'),
        '3h': ('1h', '730d'),
        '6h': ('1h', '730d'),
        '1M': ('1d', 'max'),
        '3M': ('1d', 'max'),
        '6M': ('1d', 'max'),
        '1Y': ('1d', 'max'),
        '3Y': ('1wk', 'max'),
        '6Y': ('1mo', 'max')
    }

    if interval in mapping:
        yf_interval, yf_period = mapping[interval]
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
            df = yf.download(cand, period=period, interval=interval, progress=False)
            
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

        # Fill gaps
        critical_cols = ['Open', 'High', 'Low', 'Close']
        df = df.dropna(subset=[col for col in critical_cols if col in df.columns], how='all')
        df = df.ffill().bfill()


        
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
        keep_cols = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume', 'EMA_20', 'EMA_50', 'EMA_200', 'MACD', 'MACD_Signal', 'MACD_Hist', 'RSI']
        df = df[[c for c in keep_cols if c in df.columns]]
        
        records = df.to_dict(orient='records')
        
        # Optimized Info Retrieval
        info = {}
        if resolved_ticker in _info_cache:
            cached_info, timestamp = _info_cache[resolved_ticker]
            if time.time() - timestamp < INFO_CACHE_TTL:
                info = cached_info

        if not info:
            ticker_obj = yf.Ticker(resolved_ticker)
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
            "targetPrice": pred_data[-1]["Predicted_Close"] if pred_data else None
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
        ticker_obj = yf.Ticker(ticker)
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
        
        tickers = list(symbols_dict.values())
        try:
            data = yf.download(tickers, period="2d", group_by='ticker', progress=False)
        except:
            data = pd.DataFrame()
            
        summary_data = []
        for name, symbol in symbols_dict.items():
            try:
                price, change = 0, 0
                if symbol in data.columns.levels[0]:
                    ticker_data = data[symbol]
                    if not ticker_data.empty and len(ticker_data) >= 2:
                        price = ticker_data['Close'].iloc[-1]
                        prev_price = ticker_data['Close'].iloc[-2]
                        change = ((price - prev_price) / prev_price) * 100
                    elif not ticker_data.empty:
                        price = ticker_data['Close'].iloc[-1]
                
                summary_data.append({
                    "name": name,
                    "symbol": symbol,
                    "price": round(clean_float(price), 2),
                    "changePercent": round(clean_float(change), 2),
                    "currency": "INR" if symbol.endswith(".NS") or symbol.endswith(".BO") or "USDINR" in symbol else "USD"
                })
            except:
                summary_data.append({
                    "name": name,
                    "symbol": symbol,
                    "price": 0,
                    "changePercent": 0,
                    "currency": "USD"
                })
        return {"summary": summary_data}, None
    except Exception as e:
        return {"summary": []}, str(e)

def get_top_movers_service():
    try:
        tickers = []
        for cat in ["Indian Stocks", "US Stocks"]:
            if cat in POPULAR_STOCKS:
                tickers.extend([s["ticker"] for s in POPULAR_STOCKS[cat]])
        
        tickers = tickers[:30]
        movers = []
        for t in tickers:
            try:
                ticker_obj = yf.Ticker(t)
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
            "NIFTY METAL": "^CNXMETAL"
        }
        
        sector_data = []
        for name, symbol in sectors.items():
            try:
                ticker_obj = yf.Ticker(symbol)
                hist = ticker_obj.history(period="2d")
                if len(hist) >= 2:
                    price = hist['Close'].iloc[-1]
                    prev_price = hist['Close'].iloc[-2]
                    change = ((price - prev_price) / prev_price) * 100
                    sector_data.append({
                        "name": name,
                        "change": round(clean_float(change), 2)
                    })
            except:
                continue
        return {"sectors": sector_data}, None
    except Exception as e:
        return {"sectors": []}, str(e)

def get_market_category_service(category):
    try:
        if category not in POPULAR_STOCKS:
            return None, "Category not found"
            
        assets = POPULAR_STOCKS[category]
        tickers = [a["ticker"] for a in assets]
        
        # Batch download for speed and reliability
        try:
            data = yf.download(tickers, period="2d", group_by='ticker', progress=False)
        except:
            data = pd.DataFrame()
            
        results = []
        for asset in assets:
            ticker = asset["ticker"]
            try:
                price, change, volume = 0, 0, 0
                # Handle single vs multiple tickers in download result
                if len(tickers) > 1:
                    if ticker in data.columns.levels[0]:
                        ticker_data = data[ticker]
                        if not ticker_data.empty and len(ticker_data) >= 2:
                            price = ticker_data['Close'].iloc[-1]
                            prev_price = ticker_data['Close'].iloc[-2]
                            change = ((price - prev_price) / prev_price) * 100
                            volume = ticker_data['Volume'].iloc[-1]
                        elif not ticker_data.empty:
                            price = ticker_data['Close'].iloc[-1]
                            volume = ticker_data['Volume'].iloc[-1]
                else:
                    if not data.empty:
                        ticker_data = data
                        if len(ticker_data) >= 2:
                            price = ticker_data['Close'].iloc[-1]
                            prev_price = ticker_data['Close'].iloc[-2]
                            change = ((price - prev_price) / prev_price) * 100
                            volume = ticker_data['Volume'].iloc[-1]
                        else:
                            price = ticker_data['Close'].iloc[-1]
                            volume = ticker_data['Volume'].iloc[-1]

                results.append({
                    "ticker": ticker,
                    "name": asset["name"],
                    "price": round(clean_float(price), 2),
                    "change": round(clean_float(change), 2),
                    "volume": int(clean_float(volume))
                })
            except:
                results.append({
                    "ticker": ticker,
                    "name": asset["name"],
                    "price": 0,
                    "change": 0,
                    "volume": 0
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
        elif category == "Indian Stocks":
            sources = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "^NSEI"]

        all_articles = []
        for s in sources:
            try:
                raw = yf.Ticker(s).news or []
                all_articles.extend(raw)
            except:
                continue

        # Deduplicate by title
        seen_titles = set()
        unique = []
        for a in all_articles:
            parsed = _parse_article(a)
            if parsed["title"] and parsed["title"] not in seen_titles:
                seen_titles.add(parsed["title"])
                unique.append(parsed)

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
    # Gather all known stocks
    all_known = []
    for cat, stocks in POPULAR_STOCKS.items():
        for s in stocks:
            all_known.append(s)

    # Use difflib for smarter matching
    matches = []
    for s in all_known:
        # Score based on ticker and name
        ticker_score = difflib.SequenceMatcher(None, query, s["ticker"].upper()).ratio()
        name_score = difflib.SequenceMatcher(None, query, s["name"].upper()).ratio()
        
        # Exact prefix matches get high priority
        if s["ticker"].upper().startswith(query): ticker_score += 0.5
        if s["name"].upper().startswith(query): name_score += 0.4
        
        max_score = max(ticker_score, name_score)
        if max_score > 0.4: # Threshold
            matches.append((max_score, s))

    # Sort by score and add to results
    matches.sort(key=lambda x: x[0], reverse=True)
    for score, s in matches[:8]:
        if s["ticker"] not in seen_tickers:
            results.append({
                "ticker": s["ticker"],
                "name": s["name"],
                "exchange": "NSE" if ".NS" in s["ticker"] else ("BSE" if ".BO" in s["ticker"] else "NASDAQ"),
                "type": "Stock",
                "score": score
            })
            seen_tickers.add(s["ticker"])

    # 4. Global API Lookup (Yahoo Search) as Fallback/Augmentation
    try:
        url = f"https://query2.finance.yahoo.com/v1/finance/search?q={query}&quotesCount=10&newsCount=0"
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(url, headers=headers, timeout=3)
        
        if response.status_code == 200:
            data = response.json()
            for quote in data.get("quotes", []):
                ticker = quote.get("symbol")
                if ticker and ticker not in seen_tickers:
                    # Filter out non-equity if needed, but here we want global coverage
                    results.append({
                        "ticker": ticker,
                        "name": quote.get("shortname", quote.get("longname", ticker)),
                        "exchange": quote.get("exchange", "Global"),
                        "type": quote.get("quoteType", "Equity"),
                        "score": 0.5 # Default score for API results
                    })
                    seen_tickers.add(ticker)
    except Exception as e:
        print(f"Global search error: {e}")

    # Final sort (optional, but good to keep local hits on top if they are high confidence)
    results.sort(key=lambda x: x.get('score', 0), reverse=True)

    final_results = {"results": results[:15]}
    search_cache.set(cache_key, final_results)
    
    return final_results, None
