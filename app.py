from flask import Flask, render_template
from flask_cors import CORS
from backend.routes import api_bp
import os

app = Flask(__name__, 
            static_folder='static', 
            template_folder='templates')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # portfolio screenshot OCR uploads
CORS(app)

# Register API routes
app.register_blueprint(api_bp)

from backend.services import get_stock_data_service
from flask import request, jsonify

@app.route('/stock/<symbol>', methods=['GET'])
def get_stock_pure(symbol):
    period = request.args.get('period', '1y')
    interval = request.args.get('interval', '1d')
    data, error = get_stock_data_service(symbol, period, interval)
    if error:
        return jsonify({"error": error}), 400
    
    # Strictly format as requested array
    result = []
    if data and "data" in data:
        for row in data["data"]:
            result.append({
                "time": row.get("Date"),
                "open": row.get("Open"),
                "high": row.get("High"),
                "low": row.get("Low"),
                "close": row.get("Close"),
                "volume": row.get("Volume", 0)
            })
    if not result:
        return jsonify({"error": "No data found for this timeframe"}), 400
    return jsonify(result)

@app.route('/index', methods=['GET'])
def get_indices():
    from backend.services import get_market_summary_service
    data, error = get_market_summary_service()
    if error:
        return jsonify({"error": error}), 500
    # Filter to only NIFTY, SENSEX, NASDAQ, S&P 500 as requested
    wanted = ["NIFTY 50", "SENSEX", "NASDAQ", "S&P 500"]
    filtered = [item for item in data.get("summary", []) if item["name"] in wanted]
    return jsonify(filtered)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/markets')
def markets():
    return render_template('markets.html')

@app.route('/portfolio')
def portfolio():
    return render_template('portfolio.html')

@app.route('/reports')
def reports():
    return render_template('reports.html')

# Fallback for other .html files if needed
@app.route('/<page>.html')
def serve_html(page):
    return render_template(f'{page}.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)
