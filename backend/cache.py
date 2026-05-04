import os
import json
import time
from pathlib import Path

class CacheManager:
    """
    Simple file-based persistent cache manager to ensure high performance
    and reduce API hits.
    """
    def __init__(self, cache_dir=".cache", ttl=300):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.ttl = ttl

    def _get_path(self, key):
        # Ensure key is safe for filename
        safe_key = "".join([c if c.isalnum() else "_" for c in key])
        return self.cache_dir / f"{safe_key}.json"

    def get(self, key, ttl=None):
        path = self._get_path(key)
        if not path.exists():
            return None
        
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            
            # Check TTL
            effective_ttl = ttl if ttl is not None else self.ttl
            if time.time() - data.get('timestamp', 0) > effective_ttl:
                return None
            
            return data.get('value')
        except Exception:
            return None

    def set(self, key, value):
        path = self._get_path(key)
        try:
            with open(path, 'w') as f:
                json.dump({
                    'timestamp': time.time(),
                    'value': value
                }, f)
            return True
        except Exception:
            return False

    def clear(self):
        for f in self.cache_dir.glob("*.json"):
            try:
                f.unlink()
            except Exception:
                pass

# Global instances for different data types (all set to 300s = 5m per requirements)
stock_cache = CacheManager(cache_dir="backend/data/cache/stocks", ttl=300)
search_cache = CacheManager(cache_dir="backend/data/cache/search", ttl=300)
trending_cache = CacheManager(cache_dir="backend/data/cache/trending", ttl=300)
