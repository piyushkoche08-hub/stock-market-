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
    search_stocks_service
)

api_bp = Blueprint('api', __name__, url_prefix='/api')

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
@api_bp.route("/search", methods=["GET"])
def search_stocks():
    query = request.args.get('q', '')
    data, error = search_stocks_service(query)
    if error:
        return jsonify({"detail": error}), 500
    return jsonify(data)
