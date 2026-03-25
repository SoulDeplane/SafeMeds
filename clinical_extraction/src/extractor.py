import re
import json
import os
import rapidfuzz
from typing import Any

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
        
        all_drugs = []
        for med in sorted_meds:
            med_str = str(med).upper()
            pattern = rf"\b{re.escape(med_str)}\b"
            if re.search(pattern, text.upper()):
                if not drug:
                    drug = med_str
                all_drugs.append(med_str)
        
        if not drug:
            words = text.split()
            best_match = None
            best_score = 0
            for word in words:
                clean_word = re.sub(r'[^A-Z0-9]', '', word.upper())
                if len(clean_word) < 3: continue
                match = rapidfuzz.process.extractOne(clean_word, meds, scorer=rapidfuzz.fuzz.WRatio, processor=rapidfuzz.utils.default_process)
                if match and match[1] > 90:
                    if match[1] > best_score:
                        best_score = match[1]
                        best_match = match[0]
            if best_match:
                drug = str(best_match).upper()
                all_drugs.append(drug)

        if not drug:
            match = re.search(r"^[A-Z]+(?:\s[A-Z]+)*", text)
            if match:
                drug = match.group(0)

        patterns = {
            "quantity": r"\b(ONE|TWO|1|2|1\.5|\d+(?:\.\d+)?)\s*(?:TAB|CAP|PUFF|ML|PILL|SOFTGEL)\b",
            "strength": r"(\d+(?:\.\d+)?\s?(?:MG|MCG|ML|UNITS|G|GTTS|PUFF))\b",
            "route": r"\b(PO|SUB-Q|TOPICAL|IM|NASAL|INHALATN)\b",
            "frequency": r"\b(QD|BID|TID|QID|QHS|PRN|EVERY\s+(?:\d+|[A-Z]+)\s+(?:HOURS|H0URS|DAYS)|DAILY)\b",
            "duration": r"(\d+\s*(?:DAYS|WEEKS|MONTHS))"
        }
        
        extracted: dict[str, Any] = {"drug": drug, "mentioned_drugs": list(set(all_drugs))}
        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            extracted[key] = match.group(0).upper() if match else None
            
        if "THEN" in text or "STEP-UP" in text or "TAPER" in text.upper():
            extracted["is_taper"] = True
            extracted["steps"] = re.findall(r"(\d+\s?MG\s[A-Z]+\sX\s\d+\sDAYS)", text, re.IGNORECASE)
            
        return extracted