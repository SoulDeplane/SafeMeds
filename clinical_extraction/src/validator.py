import re

class RulesEngine:
    def __init__(self):
        self.DRUG_CLASSES = {
            "NSAID": ["ADVIL", "IBUPROFEN", "NAPROXEN", "CELEBREX", "DICLOFENAC", "MELOXICAM"],
            "Statin": ["ATORVASTATIN", "CRESTOR", "LIPITOR", "LOVASTATIN", "PRAVASTATIN", "ROSUVASTATIN", "SIMVASTATIN", "ZOCOR", "LIVALO"],
            "Beta Blocker": ["BISOPROLOL", "CARVEDILOL", "LABETALOL", "METOPROLOL", "PROPRANOLOL", "TIMOLOL", "TOPROL", "ZIAC", "LOPRESSOR"],
            "ACE Inhibitor": ["BENAZEPRIL", "CAPTOPRIL", "ENALAPRIL", "LISINOPRIL", "QUINAPRIL", "RAMIPRIL", "VASOTEC", "ZESTRIL", "LOTREL"],
            "SSRI": ["CITALOPRAM", "CELEXA", "ESCITALOPRAM", "LEXAPRO", "FLUOXETINE", "PROZAC", "PAROXETINE", "PAXIL", "SERTRALINE", "ZOLOFT"]
        }
        
        self.MAX_DOSES = {
            "IBUPROFEN": {"max": 800, "unit": "MG"},
            "ADVIL": {"max": 800, "unit": "MG"},
            "LEVOTHYROXINE": {"max": 500, "unit": "MCG"},
            "ATORVASTATIN": {"max": 80, "unit": "MG"},
            "LIPITOR": {"max": 80, "unit": "MG"},
            "LISINOPRIL": {"max": 40, "unit": "MG"}
        }

    def validate(self, extracted_data: dict) -> list[str]:
        alerts = []
        
        drug = str(extracted_data.get("drug")).upper() if extracted_data.get("drug") else None
        strength_str = str(extracted_data.get("strength")).upper() if extracted_data.get("strength") else None
        mentioned = [str(d).upper() for d in extracted_data.get("mentioned_drugs", [])]
        
        # 1. Duplicate Therapy
        for class_name, drugs_in_class in self.DRUG_CLASSES.items():
            found_in_class = [d for d in mentioned if d in drugs_in_class]
            if len(found_in_class) > 1:
                alerts.append(f"Warning: Duplicate {class_name} therapy detected ({', '.join(found_in_class)}).")

        # 2. Dosage Bounds
        if drug and strength_str:
            if drug in self.MAX_DOSES:
                max_info = self.MAX_DOSES[drug]
                max_val = max_info["max"]
                expected_unit = max_info["unit"]
                
                match = re.search(r'(\d+(?:\.\d+)?)\s*([A-Z]+)', str(strength_str))
                if match:
                    val = float(match.group(1))
                    unit = match.group(2)
                    max_val_float = float(max_val)
                    expected_unit_lower = str(expected_unit).lower()
                    unit_lower = str(unit).lower()
                    
                    if unit == 'MG' and expected_unit == 'MCG':
                        alerts.append(f"POTENTIAL OVERDOSE: {drug.title()} is usually {expected_unit_lower}, not {unit_lower}.")
                    elif unit == expected_unit and val > max_val_float:
                        alerts.append(f"DOSAGE ALERT: {val}{unit_lower} exceeds typical maximum dose of {max_val_float}{expected_unit_lower} for {drug.title()}.")

        # 3. High Alert Medications
        if drug == "WARFARIN":
            alerts.append("HIGH ALERT MEDICATION: Verify INR levels.")

        return alerts
