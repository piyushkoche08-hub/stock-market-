import sys
sys.path.append('.')
from backend.services import get_stock_data

try:
    data = get_stock_data("RELIANCE.NS", period="6mo", interval="1d")
    print("Success. Data length:", len(data.get("data", [])))
    print("Error if any:", data.get("error"))
except Exception as e:
    import traceback
    traceback.print_exc()
