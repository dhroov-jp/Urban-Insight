export type {
  HistoricalReading,
  ReservoirReading as LakeReading,
  OverflowEvent,
  ReservoirReading,
  ReservoirSourceStatus,
  ReservoirSummary,
} from '../services/reservoirService';

export {
  fetchLatestReservoirData as fetchReservoirCurrent,
  fetchOverflowEvents,
  fetchReservoirHistory,
  refreshReservoirData as triggerManualScrape,
} from '../services/reservoirService';
