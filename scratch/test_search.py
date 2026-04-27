import sys
import os

# Add the project root to sys.path
sys.path.append(os.getcwd())

from backend.services import get_stock_data_service

def test_search():
    print("Testing GIBBERISH_123 search...")
    try:
        data, error = get_stock_data_service("GIBBERISH_123")
        if error:
            print(f"Error returned: {error}")
        else:
            print(f"Success! Ticker: {data.get('ticker')}")
            print(f"Is Discovery: {data.get('is_discovery')}")
    except Exception as e:
        print(f"CRASHED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_search()
