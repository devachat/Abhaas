import csv
import random

districts = ['NEW DELHI', 'NORTH DELHI', 'SOUTH DELHI', 'EAST DELHI', 'WEST DELHI', 'DWARKA', 'ROHINI', 'IGIA', 'METRO']
crimes = ['Murder', 'Rape/Assault on Women', 'Kidnapping', 'Robbery', 'Snatching', 'Extortion', 'Burglary', 'Theft', 'Motor Vehicle Theft', 'Cheating', 'Public Nuisance', 'Other IPC Crimes']
years = [2020, 2021, 2022, 2023, 2024]

records = []
records.append(['Districts', 'Crime_Head', 'Incidents_Count', 'Year'])

# Generate 2000 realistic records
for _ in range(2000):
    dist = random.choice(districts)
    crime = random.choice(crimes)
    year = random.choice(years)
    
    # Adjust count based on crime type for realism
    if crime in ['Murder', 'Kidnapping', 'Extortion']:
        count = random.randint(1, 15)
    elif crime in ['Robbery', 'Snatching', 'Burglary']:
        count = random.randint(10, 50)
    elif crime in ['Theft', 'Motor Vehicle Theft', 'Other IPC Crimes']:
        count = random.randint(30, 150)
    else:
        count = random.randint(5, 40)
        
    records.append([dist, crime, count, year])

with open('delhi_crime_data.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerows(records)

print("delhi_crime_data.csv generated successfully with 2000 records.")
