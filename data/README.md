# Static reference data

## us-zip-codes.csv

US zip code centroids — used by the matching engine for geocoding driver home zips.

- **Source:** SimpleMaps US Cities Free (https://simplemaps.com/data/us-cities)
- **License:** Free for commercial use with attribution per SimpleMaps terms
- **Format:** CSV with columns including city, state, lat, lng, zips
- **Note:** The "zips" field can contain multiple zip codes per row, comma-separated. The matching engine import process should expand this to one row per zip code.
- **Updated:** 2026-05-21
