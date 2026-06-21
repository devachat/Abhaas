import kagglehub
import os
import shutil
import csv

path = kagglehub.dataset_download("shivshekar94/delhi-crime-dataset")
print("Path to dataset files:", path)

csv_files = [f for f in os.listdir(path) if f.endswith('.csv')]
if csv_files:
    csv_file = os.path.join(path, csv_files[0])
    
    shutil.copy(csv_file, 'delhi_crime_data_real.csv')
    print(f"Copied {csv_file} to delhi_crime_data_real.csv")
    
    with open('delhi_crime_data_real.csv', 'r') as f:
        reader = csv.reader(f)
        headers = next(reader)
        print("Columns:", headers)
        print("First row:", next(reader))
else:
    print("No CSV file found in the dataset.")
