import re
import json
import os

class MedicalPreprocessor:
    def __init__(self):
        self.ocr_map = {}
        self.conversions = {}
        self.leetspeak = {"4": "A", "3": "E", "1": "I", "8": "B", "5": "S", "7": "T", "0": "O"}
        self.prefixes = ["RX:", "SIG:", "MED:", "DRUG:", "INST:", "M3D:", "NOTE:"]
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
                        self.ocr_map = data.get("ocr_corrections", {})
                        self.conversions = data.get("conversions", {})
                        return
                except Exception as e:
                    print(f"Warning: Error loading {kw_path}: {e}")
        
    def clean_text(self, text: str) -> str:
        text = text.upper().strip()
        
        for prefix in self.prefixes:
            if text.startswith(prefix):
                text = text[len(prefix):].strip()
        
        for error, fix in self.ocr_map.items():
            text = text.replace(error.upper(), fix.upper())

        # Number-to-Digit map
        num_map = {
            "FIVE HUNDRED": "500",
            "ONE": "1",
            "TWO": "2",
            "THREE": "3",
            "FOUR": "4",
            "FIVE": "5",
            "HALF": "0.5"
        }
        
        # Pull explicit conversions but filter out acronyms (like BID -> 2)
        for word, num in self.conversions.items():
            if word.upper() in ["ONE", "TWO", "HALF"]:
                num_map[word.upper()] = str(num)
                
        for word, digit in num_map.items():
            text = re.sub(rf"\b{word}\b", digit, text)

        def fix_dosage(match):
            val = match.group(1)
            unit = match.group(2)
            val = val.replace('O', '0')
            return f"{val}{unit}"
            
        text = re.sub(r'(\d[0O]*)(\s?(?:MG|MCG|ML|UNITS|G|GTTS|PUFF))', fix_dosage, text)
        
        def fix_leetspeak(match):
            word = match.group(0)
            if re.match(r'^\d+[A-Z]*$', word):
                return word
            for num, char in self.leetspeak.items():
                word = word.replace(num, char)
            return word

        text = re.sub(r'\b(?=[A-Z0-9]*[A-Z])[A-Z0-9]{3,}\b', fix_leetspeak, text)
        
        text = re.sub(r'([A-Z])0([A-Z])', r'\1O\2', text)
        
        text = re.sub(r'[%@#|_]', '', text)
        
        return text.strip()