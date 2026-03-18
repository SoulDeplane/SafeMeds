import re
import json
import os

class MedicationExtractor:
    def __init__(self):
        self.entities = {}
        self._load_keywords()

    def _load_keywords(self):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        paths = [
            os.path.join(current_dir, "..", "config", "keywords.json"),
            os.path.join(os.getcwd(), "config", "keywords.json")
        ]
        
        for kw_path in paths:
            if os.path.exists(kw_path):
                try:
                    with open(kw_path, 'r') as f:
                        data = json.load(f)
                        self.entities = data.get("entities", {})
                        return
                except Exception as e:
                    print(f"Warning: Error loading {kw_path}: {e}")
        
    def extract_med_info(self, text: str):
        drug = None
        meds = self.entities.get("medications", [])
        sorted_meds = sorted(meds, key=len, reverse=True)
        
        for med in sorted_meds:
            pattern = rf"\b{re.escape(med.upper())}\b"
            if re.search(pattern, text.upper()):
                drug = med.upper()
                break
        
        if not drug:
            match = re.search(r"^[A-Z]+(?:\s[A-Z]+)*", text)
            if match:
                drug = match.group(0)

        patterns = {
            "dosage": r"(\d+(?:\.\d+)?\s?(?:MG|MCG|ML|UNITS|G|GTTS|PUFF))",
            "route": r"\b(PO|SUB-Q|TOPICAL|IM|NASAL|INHALATN)\b",
            "frequency": r"\b(QD|BID|TID|QID|QHS|PRN|EVERY\s\d\sHOURS|EVERY\s\d\sH0URS|DAILY)\b"
        }
        
        extracted = {"drug": drug}
        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            extracted[key] = match.group(0).upper() if match else None
            
        if "THEN" in text or "STEP-UP" in text or "TAPER" in text.upper():
            extracted["is_taper"] = True
            extracted["steps"] = re.findall(r"(\d+\s?MG\s[A-Z]+\sX\s\d+\sDAYS)", text, re.IGNORECASE)
            
        return extracted