# Stock Predictor Pro 📈

A professional-grade, high-performance stock market terminal and prediction dashboard. This platform provides real-time market insights, historical data visualization, and AI-driven price predictions using a modern, immersive user interface.

## 🚀 Features

- **Live Market Dashboard**: Real-time tracking of global indices like NIFTY 50, SENSEX, NASDAQ, and S&P 500.
- **Interactive Charts**: Advanced candlestick and line charts powered by **TradingView Lightweight Charts**.
- **Predictive Analytics**: Future price trend forecasting using Scikit-Learn's Linear Regression models.
- **Market Movers**: Instant access to top gainers, top losers, and most active stocks.
- **Sector Analysis**: Track performance across various sectors like IT, Bank, Auto, and Pharma.
- **Comprehensive News**: Real-time financial news for specific tickers and general market categories.
- **Responsive Design**: Premium "Groww-style" aesthetic with glassmorphism and smooth animations.

## 🛠️ Tech Stack

- **Backend**: Python, Flask, Flask-CORS
- **External Data API**: `yfinance` (Yahoo Finance)
- **Frontend**: HTML5, Vanilla CSS3, Modern JavaScript (ES6+)
- **Charting**: TradingView Lightweight Charts
- **Machine Learning**: Scikit-Learn (Linear Regression), NumPy, Pandas

## 🔌 API Endpoints

The backend exposes a RESTful API under the `/api` prefix:

### 1. Stock Data & Predictions
`GET /api/stocks/<ticker>?period=<p>&interval=<i>`
- **Description**: Fetches historical OHLC data, technical indicators (EMA, RSI, Bollinger Bands), and 5-day future price predictions.
- **Parameters**: 
    - `ticker`: Stock symbol (e.g., `RELIANCE.NS`, `AAPL`)
    - `period`: Data range (`1d`, `5d`, `1mo`, `1y`, `max`, etc.)
    - `interval`: Time granularity (`1m`, `5m`, `1h`, `1d`, etc.)

### 2. Market Summary
`GET /api/market-summary`
- **Description**: Returns current prices and percentage changes for major global indices.

### 3. Top Movers
`GET /api/top-movers`
- **Description**: Lists top gainers, losers, and most active stocks across Indian and US markets.

### 4. Sector Performance
`GET /api/sectors`
- **Description**: Provides performance data for various NIFTY sectoral indices.

### 5. Market Categories
`GET /api/market-category/<category>`
- **Description**: Fetches list of assets and their performance for a specific category (e.g., `Indian Stocks`, `Crypto`, `Forex`).

### 6. News
- `GET /api/news/<ticker>`: News specifically related to a stock.
- `GET /api/general-news?category=<c>`: Curated market news, optionally filtered by category.

### 7. Popular Stocks
`GET /api/popular-stocks`
- **Description**: Returns a pre-defined list of popular stocks categorized by asset class.

## 📂 Project Structure

```text
├── backend/
│   ├── routes.py          # API route definitions (Flask Blueprints)
│   ├── services.py        # Core logic, data fetching, and ML models
│   ├── stocks.json        # Curated list of popular tickers
│   └── requirements.txt   # Backend dependencies
├── static/
│   ├── css/               # Modern styling and themes
│   └── js/                # Frontend logic and Chart.js integration
├── templates/             # HTML templates (Dashboard, Markets, etc.)
├── app.py                 # Main Flask application entry point
└── requirements.txt       # Project-wide dependencies
```

## ⚙️ Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd stock-market-dashboard
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**:
   ```bash
   python app.py
   ```

4. **Access the Dashboard**:
   Open your browser and navigate to `http://localhost:8000`.

## 📝 Notes
- The application automatically handles ticker suffixes (e.g., appending `.NS` for Indian stocks).
- Backend utilizes an in-memory cache (5-minute TTL) to optimize data fetching and stay within API limits.
- Intraday data fetching is intelligently capped based on Yahoo Finance's historical availability limits.
