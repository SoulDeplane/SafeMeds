from datetime import datetime
import json
import os

class DataFormatter:
    def __init__(self):
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

    def standardize(self, raw_data: dict):
        freq = str(raw_data.get("frequency")).upper() if raw_data.get("frequency") else None
        if freq in self.freq_map:
            raw_data["frequency_display"] = self.freq_map[freq]
            
        if str(raw_data.get("drug")).upper() == "LEVOTHYROXINE" and "MG" in str(raw_data.get("dosage")).upper():
            raw_data["safety_alert"] = "POTENTIAL OVERDOSE: Levothyroxine is usually mcg, not mg."
        
        if str(raw_data.get("drug")).upper() == "WARFARIN":
             raw_data["safety_alert"] = "HIGH ALERT MEDICATION: Verify INR levels."
            
        return {
            "timestamp": datetime.now().isoformat(),
            "status": "validated" if not raw_data.get("safety_alert") else "flagged",
            "data": raw_data
        }