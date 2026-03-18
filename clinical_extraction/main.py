from src import MedicalPreprocessor, MedicationExtractor, DataFormatter

raw_input = "Rx: L1S1N0PRIL10MG TABS. SIG: T4K3 1.5 T4BS P0 B1D X 14 D4YS."

preprocessor = MedicalPreprocessor()
clean_text = preprocessor.clean_text(raw_input)

extractor = MedicationExtractor()
parsed_data = extractor.extract_med_info(clean_text)

formatter = DataFormatter()
final_json = formatter.standardize(parsed_data)

print(final_json)