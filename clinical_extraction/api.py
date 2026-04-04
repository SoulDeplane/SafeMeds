import sys
import json
import re
from src import MedicalPreprocessor, MedicationExtractor, DataFormatter

def process(text):
    extractor = MedicationExtractor()
    preprocessor = MedicalPreprocessor()
    formatter = DataFormatter()
    
    lines = text.strip().split('\n')
    
    response = {
        "patientName": "",
        "patientAge": "",
        "patientGender": "",
        "doctorName": "",
        "diagnosis": "",
        "medications": []
    }
    
    for line in lines:
        upper_line = line.upper()
        if "PATIENT NAME:" in upper_line:
            parts = re.split(r'Patient Name:', line, flags=re.IGNORECASE)
            if len(parts) > 1: response["patientName"] = parts[1].strip()
        elif "AGE/GENDER:" in upper_line:
            parts = re.split(r'Age/Gender:', line, flags=re.IGNORECASE)
            if len(parts) > 1:
                ag_parts = parts[1].strip().split("/")
                response["patientAge"] = ag_parts[0].strip() if len(ag_parts) > 0 else ""
                response["patientGender"] = ag_parts[1].strip() if len(ag_parts) > 1 else ""
        elif "DOCTOR:" in upper_line:
            parts = re.split(r'Doctor:', line, flags=re.IGNORECASE)
            if len(parts) > 1: response["doctorName"] = parts[1].strip()
        elif "DIAGNOSIS:" in upper_line:
            parts = re.split(r'Diagnosis:', line, flags=re.IGNORECASE)
            if len(parts) > 1: response["diagnosis"] = parts[1].strip()

        # Drug mapping using original active ML module
        clean = preprocessor.clean_text(line)
        raw_extracted = extractor.extract_med_info(clean)
        
        if raw_extracted and raw_extracted.get("drug"):
            final = formatter.standardize(raw_extracted)
            
            med = {
                "name": final.get("drug"),
                "strength": final.get("strength") or "",
                "quantity": final.get("quantity") or "1",
                "frequency": final.get("frequency_display") or final.get("frequency") or "",
                "route": final.get("route") or "",
                "duration": final.get("duration") or "",
                "instructions": final.get("safety_alert") or ""
            }
            
            inst_match = re.search(r'(after food|before food|shake well|may cause drowsiness|with water|empty stomach)', line, re.IGNORECASE)
            if inst_match:
                med["instructions"] = inst_match.group(0)
                
            # Filter dupes or pure header matches by enforcing keywords.json validation
            valid_meds_list = [m.upper() for m in extractor.entities.get("medications", [])]
            
            # Fuzzy match strings or trailing spaces mean we should clean before validation
            clean_med_name = med["name"].upper().strip()
            if clean_med_name in valid_meds_list:
                response["medications"].append(med)
            
    print(json.dumps(response))

if __name__ == "__main__":
    input_text = sys.stdin.read()
    process(input_text)
