import logging
from flask import Blueprint, request, jsonify
from .services import (
    extract_download_history,
    get_stock_data_service,
    get_stock_news_service,
    get_market_summary_service,
    get_top_movers_service,
    get_sectors_service,
    get_market_category_service,
    get_popular_stocks,
    get_general_news_service,
    POPULAR_STOCKS,
    yf_download,
    search_stocks_service,
    search_stocks_v2_service
)

api_bp = Blueprint('api', __name__, url_prefix='/api')
logger = logging.getLogger(__name__)

@api_bp.route("/stock/<ticker>", methods=["GET"])
@api_bp.route("/stocks/<ticker>", methods=["GET"]) # keep old one for backward compatibility
def get_stock_data(ticker):
    period = request.args.get('period', '2y')
    interval = request.args.get('interval', '1d')
    data, error = get_stock_data_service(ticker, period, interval)
    if error:
        return jsonify({"detail": error}), 404 if "No data found" in error else 500
    return jsonify(data)

@api_bp.route("/news/<path:ticker>", methods=["GET"])
def get_stock_news(ticker):
    data, error = get_stock_news_service(ticker)
    if error:
        return jsonify({"detail": error}), 500
    return jsonify(data)

@api_bp.route("/market-summary", methods=["GET"])
def get_market_summary():
    data, error = get_market_summary_service()
    if error:
        return jsonify({"detail": error}), 500
    return jsonify(data)


@api_bp.route("/indices", methods=["GET"])
def get_indices():
    data, error = get_market_summary_service()
    if error:
        return jsonify({"detail": error}), 500
    wanted = {"NIFTY 50", "SENSEX", "NASDAQ", "S&P 500"}
    return jsonify([item for item in data.get("summary", []) if item.get("name") in wanted])

@api_bp.route("/top-movers", methods=["GET"])
def get_top_movers():
    data, error = get_top_movers_service()
    # Movers always returns something even on partial error
    return jsonify(data)

@api_bp.route("/sectors", methods=["GET"])
def get_sectors():
    data, error = get_sectors_service()
    return jsonify(data)

@api_bp.route("/market-category/<category>", methods=["GET"])
def get_market_category(category):
    data, error = get_market_category_service(category)
    if error:
        if error == "Category not found":
            return jsonify({"detail": error}), 404
        return jsonify({"detail": error}), 500
    return jsonify(data)

@api_bp.route("/popular-stocks", methods=["GET"])
def get_popular_stocks_route():
    return jsonify({"stocks": POPULAR_STOCKS})

@api_bp.route("/general-news", methods=["GET"])
def get_general_news():
    category = request.args.get('category')
    data, error = get_general_news_service(category)
    if error:
        return jsonify({"detail": error}), 500
    return jsonify(data)


@api_bp.route("/market-alerts", methods=["GET"])
def get_market_alerts():
    """Notification-center feed: market trend, movers, and business headlines."""
    alerts = []
    tracked = [
        ("NIFTY 50", "^NSEI", "/markets", "market"),
        ("SENSEX", "^BSESN", "/markets", "market"),
        ("NASDAQ", "^IXIC", "/markets", "market"),
        ("S&P 500", "^GSPC", "/markets", "market"),
        ("Reliance", "RELIANCE.NS", "/?ticker=RELIANCE.NS", "trend"),
        ("TCS", "TCS.NS", "/?ticker=TCS.NS", "trend"),
        ("HDFC Bank", "HDFCBANK.NS", "/?ticker=HDFCBANK.NS", "trend"),
        ("Apple", "AAPL", "/?ticker=AAPL", "trend"),
        ("NVIDIA", "NVDA", "/?ticker=NVDA", "trend"),
        ("Tesla", "TSLA", "/?ticker=TSLA", "trend"),
    ]

    try:
        symbols = [row[1] for row in tracked]
        df = yf_download(symbols, period="5d", interval="1d", group_by="ticker", progress=False, threads=True)
        for name, symbol, link, typ in tracked:
            hist = extract_download_history(df, symbol, multi_ticker=True)
            if hist.empty:
                continue
            close = hist["Close"].dropna()
            if close.empty:
                continue
            price = float(close.iloc[-1])
            prev = float(close.iloc[-2]) if len(close) >= 2 else price
            change = ((price - prev) / prev) * 100 if prev else 0
            direction = "up" if change >= 0 else "down"
            alerts.append({
                "type": typ,
                "severity": "positive" if change >= 0 else "negative",
                "title": f"{name} trending {direction}",
                "body": f"{price:.2f} ({change:+.2f}%)",
                "link": link
            })
    except Exception:
        logger.exception("market alert quotes failed")

    business_fallback = [
        ("Business radar", "Global index moves, large-cap tech, banking, energy and India market updates are being monitored."),
        ("Trend watch", "Gainers, losers and active counters refresh automatically from live market data."),
        ("Portfolio context", "Use alerts with market pages and portfolio analysis for faster decision checks."),
    ]
    for title, body in business_fallback:
        alerts.append({
            "type": "business",
            "severity": "neutral",
            "title": title,
            "body": body,
            "link": "/markets"
        })

    if not alerts:
        alerts = [
            {
                "type": "market",
                "severity": "neutral",
                "title": "Market feed is warming up",
                "body": "Live trends and business updates will appear here automatically.",
                "link": "/markets"
            }
        ]

    return jsonify({"alerts": alerts[:24]})

@api_bp.route("/quotes", methods=["GET"])
def get_bulk_quotes():
    symbols = request.args.get('symbols', '')
    if not symbols:
        return jsonify({})
    ticker_list = [s.strip() for s in symbols.split(',') if s.strip()]
    if not ticker_list:
        return jsonify({})
    try:
        from .services import yf_download
        import pandas as pd
        
        # Limit to 50 max
        ticker_list = ticker_list[:50]
        
        df = yf_download(ticker_list, period="5d", interval="1d", progress=False)
        result = {}
        
        if df.empty:
            return jsonify({})

        for sym in ticker_list:
            ticker_df = extract_download_history(df, sym, multi_ticker=len(ticker_list) > 1)
            if ticker_df.empty:
                continue
            close = ticker_df["Close"].dropna()
            if len(close) >= 2:
                price = float(close.iloc[-1])
                prev = float(close.iloc[-2])
                change = ((price - prev) / prev) * 100 if prev else 0
                result[sym] = {"price": price, "change": change}
            elif len(close) == 1:
                result[sym] = {"price": float(close.iloc[-1]), "change": 0}
                        
        return jsonify(result)
    except Exception as e:
        logger.exception("Bulk quotes failed")
        return jsonify({"detail": str(e)}), 500

@api_bp.route("/search", methods=["GET"])
def search_stocks():
    query = request.args.get('q', '')
    data, error = search_stocks_service(query)
    if error:
        return jsonify({"detail": error}), 500
    return jsonify(data)

@api_bp.route("/search/v2", methods=["GET"])
def search_stocks_v2():
    query = request.args.get('q', '')
    limit = int(request.args.get('limit', 20))
    offset = int(request.args.get('offset', 0))
    with_quotes = request.args.get('with_quotes', '0') in ('1', 'true', 'True', 'yes')
    data, error = search_stocks_v2_service(query, limit=limit, offset=offset, with_quotes=with_quotes)
    if error:
        return jsonify({"detail": error}), 500
    return jsonify(data)


@api_bp.route("/portfolio/ocr", methods=["POST"])
def portfolio_screenshot_ocr():
    """Fast server-side OCR for portfolio screenshots (RapidOCR / EasyOCR / Tesseract)."""
    if 'image' not in request.files:
        return jsonify({"detail": "Missing multipart field 'image'"}), 400
    f = request.files['image']
    if not f or not getattr(f, 'filename', None):
        return jsonify({"detail": "No image file"}), 400
    data = f.read()
    if len(data) > 15 * 1024 * 1024:
        return jsonify({"detail": "Image too large (max 15 MB)"}), 413
    try:
        from .ocr_service import run_portfolio_ocr
        result = run_portfolio_ocr(data)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"detail": str(e)}), 400
    except RuntimeError as e:
        return jsonify({"detail": str(e)}), 503
    except Exception as e:
        logger.exception("portfolio OCR failed")
        return jsonify({"detail": str(e)}), 500
