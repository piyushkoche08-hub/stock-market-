from fastapi import FastAPI, WebSocket, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
import json
import sys
import os

# Add the project root to path so we can import from the existing backend
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.services import get_stock_data_service, search_stocks_service, get_market_summary_service

app = FastAPI(title="AlphaPulse X API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/stocks/{ticker}")
async def get_stock_data(
    ticker: str, 
    period: str = "6mo", 
    interval: str = "1d"
):
    data, error = get_stock_data_service(ticker, period, interval)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return data

@app.get("/api/search")
async def search_stocks(q: str = ""):
    results, error = search_stocks_service(q)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return results

@app.get("/api/market-summary")
async def market_summary():
    data, error = get_market_summary_service()
    if error:
        raise HTTPException(status_code=500, detail=error)
    return data

# WebSocket for Real-Time Price Updates
@app.websocket("/ws/{ticker}")
async def websocket_endpoint(websocket: WebSocket, ticker: str):
    await websocket.accept()
    try:
        while True:
            # In a real app, you'd fetch live data from a real-time provider like Twelve Data or Polygon
            # For demonstration, we'll simulate real-time updates based on historical data
            data, error = get_stock_data_service(ticker, period="1d", interval="1m")
            if not error and data['data']:
                latest = data['data'][-1]
                await websocket.send_json({
                    "ticker": ticker,
                    "price": latest['Close'],
                    "time": latest['Date'],
                    "volume": latest['Volume']
                })
            await asyncio.sleep(5) # Update every 5 seconds
    except Exception as e:
        print(f"WS Error: {e}")
    finally:
        await websocket.close()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
