import logging
from datetime import date
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from ..config import settings
from .. import db
from .scraper import scrape_lake_readings
from .blackmarble import fetch_and_process_latest_lighting

logger = logging.getLogger("urbaninsight.scheduler")

scheduler = AsyncIOScheduler()

async def scheduled_scrape_job():
    logger.info("Running daily scheduled reservoir scrape job...")
    url = settings.RESERVOIR_SCRAPER_URL
    if not url:
        logger.warning("No reservoir scraper URL configured. Skipping scheduled scrape.")
        return
        
    try:
        data = await scrape_lake_readings(url)
        readings = data.get("readings", [])
        report_date = data.get("date", date.today().isoformat())
        
        if readings and len(readings) == 7:
            db.save_scraped_readings(readings, report_date, url)
            logger.info(f"Successfully scraped and saved readings for date: {report_date}")
        else:
            logger.warning("Scraper returned incomplete readings. Skipping database insertion to prevent null/incomplete data.")
    except Exception as e:
        logger.error(f"Scheduled reservoir scrape job failed: {e}. Skipping database insertion to prevent overwrite.")

async def scheduled_lighting_job():
    try:
        await fetch_and_process_latest_lighting()
    except Exception as e:
        logger.error(f"Scheduled lighting job failed: {e}")


def start_scheduler():
    # Schedule to run once daily after 6 AM. Let's schedule it for 06:15 AM local time
    # (since the BMC publishes data at 6:00 AM)
    scheduler.add_job(scheduled_scrape_job, 'cron', hour=6, minute=15, id='reservoir_scrape_job', replace_existing=True)
    scheduler.add_job(scheduled_lighting_job, 'cron', hour=6, minute=30, id='lighting_scrape_job', replace_existing=True)
    scheduler.start()
    logger.info("APScheduler started: daily reservoir scraping scheduled for 6:15 AM, lighting for 6:30 AM.")

def shutdown_scheduler():
    scheduler.shutdown()
    logger.info("APScheduler shut down.")
