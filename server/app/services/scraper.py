import re
import httpx
import logging
from bs4 import BeautifulSoup

logger = logging.getLogger("urbaninsight.scraper")

LAKE_MAPPINGS = {
    'upper vaitarna': 'Upper Vaitarna',
    'modak sagar': 'Modak Sagar',
    'tansa': 'Tansa',
    'middle vaitarna': 'Middle Vaitarna',
    'bhatsa': 'Bhatsa',
    'vihar': 'Vihar',
    'tulsi': 'Tulsi'
}

async def scrape_lake_readings(source_url: str) -> dict:
    """
    Modular scraper that fetches reservoir data from a source URL and parses it.
    Tolerates missing days (logs and handles gracefully).
    """
    logger.info(f"Fetching lake stock data from {source_url}")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(source_url)
            resp.raise_for_status()
            html_content = resp.text
    except Exception as e:
        logger.error(f"Failed to fetch water stock page: {e}")
        raise RuntimeError(f"Network error fetching lake data: {e}")

    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Look for table rows
        rows = soup.find_all('tr')
        if not rows:
            raise ValueError("No table rows found in the HTML source.")
            
        readings = []
        citywide_percent = None
        
        # Standardize values extraction
        for row in rows:
            cells = [cell.get_text(strip=True) for cell in row.find_all(['td', 'th'])]
            if not cells:
                continue
                
            row_text_lower = " ".join(cells).lower()
            
            matched_lake = None
            for search_key, official_name in LAKE_MAPPINGS.items():
                if search_key in row_text_lower:
                    matched_lake = official_name
                    break
                    
            if matched_lake:
                # Extract all numbers from the cells in this row
                numeric_cells = []
                for cell in cells:
                    clean_cell = cell.replace(',', '').strip()
                    # Match integers or floats
                    match = re.search(r'^[-+]?\d*\.?\d+$', clean_cell)
                    if match:
                        numeric_cells.append(float(clean_cell))
                
                # We expect columns: Live Content (ML), % Stock, 24 hr Rainfall
                # Some tables might have full capacity first: [capacity, content, percent, rain]
                # Some might have just: [content, percent, rain]
                if len(numeric_cells) >= 3:
                    if len(numeric_cells) >= 4:
                        content_ml = numeric_cells[1]
                        percent_stock = numeric_cells[2]
                        rainfall = numeric_cells[3]
                    else:
                        content_ml = numeric_cells[0]
                        percent_stock = numeric_cells[1]
                        rainfall = numeric_cells[2]
                        
                    readings.append({
                        'lake_name': matched_lake,
                        'percent_stock': percent_stock,
                        'content_ml': content_ml,
                        'rainfall_mm_24hr': rainfall
                    })
            
            # Extract combined citywide total percent if available
            if 'total' in row_text_lower or 'combined' in row_text_lower or 'all lakes' in row_text_lower:
                numeric_cells = []
                for cell in cells:
                    clean_cell = cell.replace(',', '').strip()
                    match = re.search(r'^[-+]?\d*\.?\d+$', clean_cell)
                    if match:
                        numeric_cells.append(float(clean_cell))
                # Percentage is usually between 0 and 100
                for num in numeric_cells:
                    if 0.0 <= num <= 100.0 and (citywide_percent is None or num > citywide_percent):
                        citywide_percent = num
        
        if len(readings) < 7:
            raise ValueError(f"Incomplete data: only parsed {len(readings)} of 7 lakes.")
            
        # Try to find a date in the HTML text
        text_content = soup.get_text()
        report_date = None
        date_match = re.search(r'\b(20\d{2}-\d{2}-\d{2})\b', text_content)
        if date_match:
            report_date = date_match.group(1)
        else:
            slash_date_match = re.search(r'\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b', text_content)
            if slash_date_match:
                d, m, y = slash_date_match.groups()
                report_date = f"{y}-{int(m):02d}-{int(d):02d}"

        if not report_date:
            raise ValueError("BMC report did not include a recognizable report date")

        # If combined percent is still None, calculate weighted average from the 7 lakes
        if citywide_percent is None:
            lake_capacities = {
                'Upper Vaitarna': 227047.0,
                'Modak Sagar': 128925.0,
                'Tansa': 145080.0,
                'Middle Vaitarna': 193530.0,
                'Bhatsa': 717037.0,
                'Vihar': 27698.0,
                'Tulsi': 8046.0
            }
            total_cap = sum(lake_capacities.values())
            total_content = sum(r['content_ml'] for r in readings)
            citywide_percent = round((total_content / total_cap) * 100, 2)
            
        return {
            'readings': readings,
            'combined_percent_stock': citywide_percent,
            'date': report_date,
            'source_url': source_url
        }
    except Exception as e:
        logger.error(f"Failed to parse water stock HTML: {e}")
        raise ValueError(f"Parsing error: {e}")
