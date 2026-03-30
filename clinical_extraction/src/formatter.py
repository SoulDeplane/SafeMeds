from datetime import datetime, timedelta
import json
import os
from .validator import RulesEngine

class DataFormatter:
    def __init__(self):
        self.rules_engine = RulesEngine()
        self.freq_map = {
            "QD": "once daily", 
            "BID": "twice daily", 
            "TID": "three times daily",
            "QID": "four times daily",
            "QHS": "at bedtime",
            "PRN": "as needed"
        }
        self._load_keywords()

    def _load_keywords(self):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        kw_path = os.path.join(current_dir, "..", "config", "keywords.json")
        if os.path.exists(kw_path):
            try:
                with open(kw_path, 'r') as f:
                    data = json.load(f)
            except Exception:
                pass

    def calculate_dates(self, duration_str: str):
        if not duration_str:
            return None, None
        
        duration_str = duration_str.upper()
        parts = duration_str.split()
        if len(parts) >= 2:
            try:
                num = int(parts[0])
                unit = parts[1]
                
                days = 0
                if "DAY" in unit:
                    days = num
                elif "WEEK" in unit:
                    days = num * 7
                elif "MONTH" in unit:
                    days = num * 30
                    
                start_date = datetime.now()
                end_date = start_date + timedelta(days=days)
                return start_date.isoformat(), end_date.isoformat()
            except ValueError:
                pass
        return None, None

    def standardize(self, raw_data: dict):
        freq = str(raw_data.get("frequency")).upper() if raw_data.get("frequency") else None
        if freq and isinstance(freq, str) and freq in self.freq_map:
            raw_data["frequency_display"] = self.freq_map[freq]
            
        alerts = self.rules_engine.validate(raw_data)
        if alerts:
            raw_data["safety_alert"] = " | ".join(alerts)
             
        duration = raw_data.get("duration")
        if duration:
            start_date, end_date = self.calculate_dates(duration)
            if start_date and end_date:
                raw_data["start_date"] = start_date
                raw_data["end_date"] = end_date
            
        raw_data["timestamp"] = datetime.now().isoformat()
        raw_data["status"] = "validated" if not raw_data.get("safety_alert") else "flagged"
        return raw_data