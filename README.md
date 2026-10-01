# Urban Insight

## Run Locally

Install dependencies and start the frontend with `npm install` followed by `npm run dev`.

## Construction Activity Monitoring

This module detects new built-up land (construction activity) within a
user-drawn area of interest (AOI) by comparing the Normalized Difference
Built-up Index (NDBI) between two free Sentinel-2 satellite scenes — a
recent "after" scene and a "before" baseline from ~6 months earlier.

It's implemented as a separate FastAPI backend in [`server/`](server/README.md),
since the satellite raster processing (`rasterio`, polygon vectorization)
is Python-only. The frontend talks to it over `/api/construction/check`,
proxied through Vite in dev (see `vite.config.ts`).

### 1. Get free Copernicus Data Space Ecosystem credentials

Sentinel-2 imagery is accessed via the Copernicus Data Space Ecosystem's
Sentinel Hub APIs, which are free for this kind of use:

1. Create an account at **https://dataspace.copernicus.eu** (free, no credit card).
2. Log in, then go to your **User Settings → OAuth clients**.
3. Click **"Add new OAuth client"**, give it any name, and copy the
   generated **Client ID** and **Client Secret** — the secret is only shown once.

### 2. Configure and run the backend

```bash
cd server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env and paste in SH_CLIENT_ID / SH_CLIENT_SECRET from step 1
uvicorn app.main:app --reload --port 8000
```

### 3. Run the frontend as usual

```bash
npm install
npm run dev
```

With the backend running on port 8000, the frontend's dev proxy picks it
up automatically — no extra frontend config needed. Open the app, switch
to the **Construction** tab, draw an AOI on the map, and click
**"Check Construction Activity."**

See [`server/README.md`](server/README.md) for endpoint details, caching
behavior, and architecture notes.


## Live Reservoir & Lake Stock Tracker

This module provides real-time geospatial diagnostics and historical analytics for Mumbai's 7 water-supply lakes (Bhatsa, Middle Vaitarna, Upper Vaitarna, Tansa, Modak Sagar, Vihar, Tulsi).

### 1. Data Source & Cadence

BMC's Hydraulic Engineer's Department publishes one reading daily at 6:00 AM. 

- **Automated Scraping Schedule**: The backend initiates an automated scraping task once daily at **6:15 AM** local time.
- **Off-monsoon Resiliency**: Readings are only reliably published during the monsoon window (June–October). Outside this window, the scheduled job tolerates missing days without throwing errors by logging the event and skipping database updates (preventing overwriting existing data with nulls).

### 2. Manual Scraper Trigger

To test or manually refresh the database:
- **Button in UI**: In the left panel of the **Reservoirs** module, click the **"Force Scraping Trigger"** button.
- **REST Endpoint**: Send a POST request to `http://localhost:8000/api/reservoirs/scrape`.

### 3. Environment Configurations

Configure these options in `server/.env`:
- `RESERVOIR_SCRAPER_URL`: Source URL to fetch and scrape the daily HTML table. By default, it points to a built-in mock endpoint (`http://localhost:8000/api/reservoirs/mock-source`) to allow out-of-the-box local testing.
- `RESERVOIR_DEMAND_ML_DAY`: Daily citywide consumption demand constant in Million Litres (default: `4200.0` ML/day). Used to calculate the Days of Supply Remaining.


## Nighttime Lighting Adequacy

This module measures area-level lighting adequacy based on NASA VIIRS Black Marble satellite data (VNP46A2), cross-referenced with OpenStreetMap land-use categories. It detects whether an area's nighttime lighting is normal, dimmer than usual, or chronically under-lit compared to its own 90-day history.

### Data Source & Resolution

- **NASA VIIRS Black Marble (VNP46A2)**: Free via NASA Earthdata.
- **Update Cadence**: One satellite pass per night (~1:30 AM local time), processed and available within 3-5 hours. The module automatically fetches the most recent clear night (excluding cloud-obscured readings).
- **Resolution**: ~500m per pixel. This module detects **area-level brightness**, not individual streetlights. 

### Land-Use Masking

To prevent naturally dark areas from being flagged as "under-lit", the module uses OpenStreetMap (via Overpass API) to classify grid cells. 
- Cells overlapping residential, roads, or built-up zones receive a lighting score.
- Cells over parks, water, mangroves, or other natural areas are excluded and labeled as "Not evaluated — natural area".

### Configuration

Configure Earthdata credentials in `server/.env`:
- `EARTHDATA_USERNAME`
- `EARTHDATA_PASSWORD`

*(Register for free at https://urs.earthdata.nasa.gov)*

