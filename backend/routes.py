import logging
from flask import Blueprint, request, jsonify
from .services import (
    get_stock_data_service,
    get_stock_news_service,
    get_market_summary_service,
    get_top_movers_service,
    get_sectors_service,
    get_market_category_service,
    get_popular_stocks,
    get_general_news_service,
    POPULAR_STOCKS,
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

@api_bp.route("/quotes", methods=["GET"])
def get_bulk_quotes():
    symbols = request.args.get('symbols', '')
    if not symbols:
        return jsonify({})
    ticker_list = [s.strip() for s in symbols.split(',') if s.strip()]
    if not ticker_list:
        return jsonify({})
    try:
        from .services import yf_session
        import yfinance as yf
        import pandas as pd
        
        # Limit to 50 max
        ticker_list = ticker_list[:50]
        
        df = yf.download(ticker_list, period="5d", interval="1d", progress=False, session=yf_session)
        result = {}
        
        if df.empty or 'Close' not in df:
            return jsonify({})
            
        close_df = df['Close']
        if isinstance(close_df, pd.Series):
            s = close_df.dropna()
            sym = ticker_list[0]
            if len(s) >= 2:
                price = float(s.iloc[-1])
                prev = float(s.iloc[-2])
                change = ((price - prev) / prev) * 100 if prev else 0
                result[sym] = {"price": price, "change": change}
            elif len(s) == 1:
                result[sym] = {"price": float(s.iloc[-1]), "change": 0}
        else:
            for sym in ticker_list:
                if sym in close_df:
                    s = close_df[sym].dropna()
                    if len(s) >= 2:
                        price = float(s.iloc[-1])
                        prev = float(s.iloc[-2])
                        change = ((price - prev) / prev) * 100 if prev else 0
                        result[sym] = {"price": price, "change": change}
                    elif len(s) == 1:
                        result[sym] = {"price": float(s.iloc[-1]), "change": 0}
                        
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
