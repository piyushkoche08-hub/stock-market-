# Stock Market Dashboard

A Flask-based stock market dashboard with a separated backend API and Flask-rendered frontend.

## Structure

```text
backend/
  routes.py       Flask API blueprint under /api
  services.py     Data fetching, indicators, predictions, search, news
  cache.py        Runtime file cache manager
  stocks.json     Curated ticker universe
frontend/
  routes.py       Flask page routes for the UI
static/
  css/            UI styles
  js/             Browser-side interaction and API calls
templates/        Flask HTML templates
app.py            Application factory and blueprint wiring
```

## How It Works

- The backend fetches stock, index, sector, news, OCR, and search data from source services.
- The backend exposes that data through `/api/...` endpoints.
- The frontend is the Flask UI in `templates/` and `static/`; it interacts with users and calls the backend APIs.

## Main API Endpoints

- `GET /api/stocks/<ticker>?period=<p>&interval=<i>`
- `GET /api/search?q=<query>`
- `GET /api/search/v2?q=<query>&limit=20&offset=0&with_quotes=1`
- `GET /api/market-summary`
- `GET /api/indices`
- `GET /api/top-movers`
- `GET /api/sectors`
- `GET /api/market-category/<category>`
- `GET /api/news/<ticker>`
- `GET /api/general-news?category=<category>`
- `GET /api/popular-stocks`
- `POST /api/portfolio/ocr`

## Run Locally

```bash
pip install -r requirements.txt
python app.py
```

Open `http://localhost:8000`.

## Notes

Runtime caches are written to `backend/data/cache/` and are ignored by git. Python bytecode, virtual environments, Node dependencies, and build outputs are also ignored.
