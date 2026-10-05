import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from .reservoir_service import refresh_reservoir_snapshot
from .blackmarble import fetch_and_process_latest_lighting

logger = logging.getLogger("urbaninsight.scheduler")

scheduler = AsyncIOScheduler()

async def scheduled_scrape_job():
    logger.info("Running daily scheduled reservoir scrape job...")
    try:
        snapshot = await refresh_reservoir_snapshot()
        logger.info("Reservoir refresh completed with source status: %s", snapshot.get("sourceStatus"))
    except Exception as e:
        logger.error("Scheduled reservoir scrape job failed: %s", e)

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
