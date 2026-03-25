import json
from src import MedicalPreprocessor, MedicationExtractor, DataFormatter

def run_batch_test():
    extractor = MedicationExtractor()
    preprocessor = MedicalPreprocessor()
    formatter = DataFormatter()
    
    with open("data/sample_notes.txt", "r") as f:
        notes = f.read().split("================================================================")

    results = []
    for section in notes:
        # Simple split to get individual cases
        lines = section.strip().split('\n')
        for line in lines:
            if ":" in line and not line.startswith("CATEGORY"):
                clean = preprocessor.clean_text(line)
                raw_extracted = extractor.extract_med_info(clean)
                final = formatter.standardize(raw_extracted)
                results.append(final)

    with open("data/processed_results.json", "w") as out:
        json.dump(results, out, indent=4)
    print("Batch Processing Complete. Check processed_results.json")

if __name__ == "__main__":
    run_batch_test()