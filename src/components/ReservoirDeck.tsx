import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Droplet,
  Clock,
  RefreshCw,
  Loader2,
  AlertTriangle,
  X,
  TrendingUp,
  Flame,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '../lib/utils';
import type { ReservoirSummary, LakeReading, HistoricalReading, OverflowEvent } from '../lib/reservoirApi';
import { IconButton, Panel, PanelHeader } from './ui';
import { formatDate, formatDateTime } from '../lib/date';

// Get stock health color class
export function getStockColorClass(percent: number) {
  if (percent >= 90) return 'text-emerald-400';
  if (percent >= 70) return 'text-amber-400';
  return 'text-rose-400';
}

export function getStockBgClass(percent: number) {
  if (percent >= 90) return 'bg-emerald-500';
  if (percent >= 70) return 'bg-amber-500';
  return 'bg-rose-500';
}

export function getStockGlowClass(percent: number) {
  if (percent >= 90) return 'shadow-[0_0_20px_rgba(16,185,129,0.4)]';
  if (percent >= 70) return 'shadow-[0_0_20px_rgba(245,158,11,0.3)]';
  return 'shadow-[0_0_20px_rgba(244,63,94,0.4)]';
}

// ---------- Left deck: Summary statistics + lake selectors ----------

interface ReservoirControlPanelProps {
  summary: ReservoirSummary | null;
  selectedLakeName: string | null;
  onSelectLake: (name: string | null) => void;
  onTriggerScrape: () => void;
  isScraping: boolean;
  scrapeError: string | null;
  scrapeSuccess: boolean;
}

export function ReservoirControlPanel({
  summary,
  selectedLakeName,
  onSelectLake,
  onTriggerScrape,
  isScraping,
  scrapeError,
  scrapeSuccess,
}: ReservoirControlPanelProps) {
  if (!summary) {
    return (
      <Panel className="flex flex-col items-center justify-center space-y-4 border-white/5 h-[400px]">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-xs text-white/50">Loading reservoir data...</p>
      </Panel>
    );
  }

  if (summary.sourceStatus === 'unavailable' || summary.readings.length === 0) {
    return (
      <Panel className="flex flex-col items-center justify-center space-y-4 border-rose-500/20 bg-rose-500/5 min-h-[320px] text-center">
        <AlertTriangle className="w-8 h-8 text-rose-400" />
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-rose-400">Live Data Unavailable</p>
          <p className="text-[10px] text-white/45 mt-2 max-w-[220px]">{summary.error || 'The BMC reservoir report could not be retrieved.'}</p>
        </div>
        <button onClick={onTriggerScrape} disabled={isScraping} className="ui-button-secondary">
          <RefreshCw className={cn("w-3 h-3", isScraping && "animate-spin")} />
          <span>Retry Refresh</span>
        </button>
      </Panel>
    );
  }

  const {
    lastUpdated,
    daysSinceUpdate,
    dailyDemandML,
    totalUsefulStorageML,
    totalUsefulCapacityML,
    overallUsefulStoragePercent,
    daysOfSupply,
    readings,
  } = summary;

  // Freshness status
  const isFresh = summary.sourceStatus === 'live';
  const sourceStatus = summary.sourceStatus === 'live' ? 'LIVE' : 'CACHED';
  const updatedLabel = lastUpdated ? `${formatDateTime(lastUpdated).replace(' ', ' · ')} IST` : '—';

  return (
    <Panel className="flex flex-col space-y-5 border-white/5 overflow-y-auto max-h-[calc(100vh-12rem)] scrollbar-thin">
      <PanelHeader icon={Droplet} title="Water Reservoir Tracker" status={sourceStatus} statusTone={isFresh ? 'emerald' : 'amber'} />

      {/* Freshness Status Banner (non-alarming style) */}
      <div className={cn(
        "glass rounded-2xl p-3 border border-white/5 flex items-center space-x-3 transition-colors",
        isFresh ? "bg-emerald-500/5 border-emerald-500/10" : "bg-amber-500/5 border-amber-500/10"
      )}>
        <Clock className={cn("w-4 h-4 flex-shrink-0", isFresh ? "text-emerald-400" : "text-amber-400")} />
        <div className="text-left leading-tight">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Data Freshness</p>
          <p className="text-[10px] font-medium text-white/80 mt-0.5">
            {isFresh
              ? `Live report · ${updatedLabel}`
              : `Last updated ${updatedLabel} · ${daysSinceUpdate} days ago · cached`}
          </p>
        </div>
      </div>

      {summary.sourceStatus === 'cached' && (
        <div className="glass rounded-2xl p-3 border-amber-500/20 bg-amber-500/5 flex items-start space-x-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-200/75 leading-relaxed">
            Live data unavailable. Showing the last successful BMC report from {updatedLabel}.
          </p>
        </div>
      )}

      {/* Citywide Summary Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="ui-card relative overflow-hidden">
          <div className="absolute top-2 right-2 opacity-10">
            <Droplet className="w-8 h-8 text-emerald-400" />
          </div>
          <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Citywide Stock</p>
          <div className="flex items-baseline space-x-1">
            <p className={cn("text-3xl font-black tracking-tighter leading-none", getStockColorClass(overallUsefulStoragePercent))}>
              {overallUsefulStoragePercent.toFixed(2)}%
            </p>
          </div>
          <p className="text-[8px] text-white/30 mt-2">
            {totalUsefulStorageML.toLocaleString()} / {totalUsefulCapacityML.toLocaleString()} ML
          </p>
        </div>

        <div className="ui-card relative overflow-hidden">
          <div className="absolute top-2 right-2 opacity-10">
            <TrendingUp className="w-8 h-8 text-emerald-400" />
          </div>
          <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Days of Supply</p>
          <p className="flex items-baseline gap-1 text-3xl font-black text-white tracking-tighter leading-none">
            {Math.floor(daysOfSupply)}
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Days</span>
          </p>
          <p className="text-[8px] text-white/30 mt-2">
            Demand: {dailyDemandML.toLocaleString()} ML/day
          </p>
        </div>
      </div>

      {/* 7 Water Supply Lakes List */}
      <div className="space-y-3">
        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
          Supply Reservoirs
        </h3>
        
        <div className="space-y-2">
          {readings.map((lake) => {
            const isSelected = selectedLakeName === lake.reservoirName;
            return (
              <button
                key={lake.reservoirName}
                onClick={() => onSelectLake(isSelected ? null : lake.reservoirName)}
                className={cn(
                  "w-full flex flex-col p-3 rounded-2xl transition-all duration-300 border text-left group",
                  isSelected
                    ? "bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.05)]"
                    : "hover:bg-white/5 border-transparent"
                )}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div className="flex items-center space-x-2">
                    <div className={cn("w-1.5 h-1.5 rounded-full", getStockBgClass(lake.percentage), getStockGlowClass(lake.percentage))} />
                    <span className={cn(
                      "text-xs font-black uppercase tracking-wider",
                      isSelected ? "text-white" : "text-white/60 group-hover:text-white"
                    )}>
                      {lake.reservoirName}
                    </span>
                  </div>
                  <span className={cn("text-xs font-black", getStockColorClass(lake.percentage))}>
                    {lake.percentage.toFixed(2)}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mb-1">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", getStockBgClass(lake.percentage))}
                    style={{ width: `${lake.percentage}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[8px] text-white/30 font-bold uppercase tracking-wider w-full mt-1">
                  <span>{lake.storageML.toLocaleString()} / {lake.capacityML.toLocaleString()} ML</span>
                  {lake.change24h !== null ? (
                    <span className="flex items-center text-sky-400">
                      <TrendingUp className="w-2 h-2 mr-0.5" />
                      {lake.change24h > 0 ? '↑ Rising' : lake.change24h < 0 ? '↓ Falling' : '→ Stable'}
                    </span>
                  ) : (
                    <span className="text-white/25">— No 24h change</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Manual Trigger / Admin Box */}
      <div className="pt-4 border-t border-white/5 flex flex-col space-y-3">
        <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
          <span>Scraper Actions</span>
          <span className="text-[8px] font-bold text-white/20 italic">6 AM Daily</span>
        </div>

        {scrapeError && (
          <div className="glass rounded-xl p-2.5 border-rose-500/20 bg-rose-500/5 flex items-start space-x-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
            <p className="text-[9px] text-rose-300/80 leading-relaxed">{scrapeError}</p>
          </div>
        )}

        {scrapeSuccess && (
          <div className="glass rounded-xl p-2.5 border-emerald-500/20 bg-emerald-500/5 flex items-start space-x-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-[9px] text-emerald-300/80 leading-relaxed">Successfully triggered scrape! Data updated.</p>
          </div>
        )}

        <button
          onClick={onTriggerScrape}
          disabled={isScraping}
          className={cn(
            "ui-button-secondary w-full",
            isScraping 
              ? "bg-white/5 text-white/20 cursor-not-allowed" 
              : ""
          )}
        >
          {isScraping ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Fetching Live Stock Report...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3" />
              <span>Refresh BMC Report</span>
            </>
          )}
        </button>
      </div>
    </Panel>
  );
}

// ---------- Right deck: Historical Area Chart + Overflow comparison ----------

interface ReservoirResultsPanelProps {
  selectedLake: LakeReading | null;
  history: HistoricalReading[];
  overflowEvents: OverflowEvent[];
  historyDays: number;
  setHistoryDays: (days: number) => void;
  isLoadingHistory: boolean;
  onClose: () => void;
}

export function ReservoirResultsPanel({
  selectedLake,
  history,
  overflowEvents,
  historyDays,
  setHistoryDays,
  isLoadingHistory,
  onClose,
}: ReservoirResultsPanelProps) {
  
  // Pivot overflow events to render YoY Comparison: Year on columns, Lake on rows
  const overflowPivot = useMemo(() => {
    const years = Array.from(new Set(overflowEvents.map(e => e.year))).sort((a, b) => b - a); // 2026, 2025, 2024, etc.
    const lakes = Array.from(new Set(overflowEvents.map(e => e.lake_name))).sort();
    
    const rows = lakes.map(lake => {
      const rowData: Record<string, string> = { lake_name: lake };
      years.forEach(year => {
        const ev = overflowEvents.find(e => e.lake_name === lake && e.year === year);
        rowData[year.toString()] = ev ? ev.overflow_date : 'N/A';
      });
      return rowData;
    });
    
    return { years, rows };
  }, [overflowEvents]);

  return (
    <Panel className="flex flex-col h-full border-white/5 shadow-2xl relative overflow-y-auto max-h-[calc(100vh-12rem)] scrollbar-thin">
      
      {/* 1. Lake Detail Panel State */}
      {selectedLake ? (
        <div className="flex flex-col h-full space-y-6">
          <PanelHeader
            icon={Droplet}
            title="Reservoir Diagnostics"
            status={`${selectedLake.percentage.toFixed(2)}% stocked`}
            statusTone={selectedLake.percentage >= 90 ? 'emerald' : selectedLake.percentage >= 70 ? 'amber' : 'rose'}
            actions={<IconButton onClick={onClose} label="Close reservoir inspector"><X className="w-4 h-4" /></IconButton>}
          />

          <div>
            <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1 italic">Selected Lake</h4>
            <h2 className="text-2xl font-black tracking-tighter text-white uppercase italic leading-none">
              {selectedLake.reservoirName}
            </h2>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="glass rounded-xl p-3 border-white/5">
              <span className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-1">Live Stock</span>
              <p className="text-base font-black text-white leading-none">
                {Math.round(selectedLake.storageML).toLocaleString()}
                <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest ml-0.5">ML</span>
              </p>
              <span className="text-[8px] text-white/30 block mt-1">Cap: {Math.round(selectedLake.capacityML).toLocaleString()}</span>
            </div>
            <div className="glass rounded-xl p-3 border-white/5">
              <span className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-1">Fill Level</span>
              <p className={cn("text-base font-black leading-none", getStockColorClass(selectedLake.percentage))}>
                {selectedLake.percentage.toFixed(2)}%
              </p>
            </div>
            <div className="glass rounded-xl p-3 border-white/5">
              <span className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-1">24h Rain</span>
              <p className="text-base font-black text-sky-400 leading-none">
                {selectedLake.rainfall24h ?? '—'}
                <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest ml-0.5">mm</span>
              </p>
            </div>
          </div>

          {/* Trend Chart Title & Selector */}
          <div className="flex flex-col space-y-4 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Stock Trend Curve</span>
              </div>
              <div className="glass rounded-lg p-0.5 flex border-white/5">
                <button
                  onClick={() => setHistoryDays(30)}
                  className={cn(
                    "px-2.5 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all",
                    historyDays === 30 ? "bg-emerald-500 text-black" : "text-white/40 hover:text-white/80"
                  )}
                >
                  30d
                </button>
                <button
                  onClick={() => setHistoryDays(90)}
                  className={cn(
                    "px-2.5 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all",
                    historyDays === 90 ? "bg-emerald-500 text-black" : "text-white/40 hover:text-white/80"
                  )}
                >
                  90d
                </button>
              </div>
            </div>

            {/* Recharts Chart */}
            <div className="w-full h-44 glass rounded-2xl border-white/5 p-2 flex items-center justify-center overflow-hidden">
              {isLoadingHistory ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                  <span className="text-[10px] text-white/40">Loading history...</span>
                </div>
              ) : history.length === 0 ? (
                <span className="text-[10px] text-white/30">No historical data available.</span>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={history}
                    margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorStock" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 7, fontWeight: 900 }} 
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatDate(String(v))}
                    />
                    <YAxis 
                      tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 7, fontWeight: 900 }}
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip 
                      contentStyle={{ 
                        backgroundColor: '#0a0a0a', 
                        borderColor: 'rgba(255,255,255,0.1)', 
                        borderRadius: '0.75rem', 
                        fontSize: '9px',
                        fontWeight: 900,
                        color: '#fff',
                        fontFamily: 'Inter, sans-serif'
                      }}
                      labelFormatter={(label) => `Date: ${formatDate(String(label))}`}
                      formatter={(value: any, name: string) => {
                        if (name === "percent_stock") return [`${value}%`, "Stock Level"];
                        if (name === "rainfall_mm_24hr") return [`${value} mm`, "Daily Rain"];
                        return [value, name];
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="percent_stock" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorStock)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      ) : (
        
        // 2. Default State: Overflow YoY Comparison
        <div className="flex flex-col h-full space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
              Year-over-Year Analysis
            </h3>
          </div>

          <div>
            <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1 italic">Water Security</h4>
            <h2 className="text-xl font-black tracking-tighter text-white uppercase italic leading-none">
              YoY Overflow Calendar
            </h2>
            <p className="text-[9px] text-white/30 mt-2 font-medium leading-relaxed">
              Monsoonal overflow dates provide key indicators for water resource freshness. 
              The table below records the first overflow date of reservoirs across seasons.
            </p>
          </div>

          {/* Pivot Table */}
          <div className="overflow-x-auto glass rounded-2xl border-white/5 scrollbar-thin">
            <table className="w-full text-left text-[9px] border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="p-3 font-black uppercase text-white/40 tracking-wider">Lake</th>
                  {overflowPivot.years.map(year => (
                    <th key={year} className="p-3 font-black uppercase text-white/40 tracking-wider text-center">
                      {year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overflowPivot.rows.map((row, idx) => (
                  <tr 
                    key={row.lake_name}
                    className={cn(
                      "border-b border-white/5 hover:bg-white/5 transition-colors",
                      idx === overflowPivot.rows.length - 1 ? "border-b-0" : ""
                    )}
                  >
                    <td className="p-3 font-bold text-white/70 uppercase tracking-wide">
                      {row.lake_name}
                    </td>
                    {overflowPivot.years.map(year => {
                      const dateVal = row[year.toString()];
                      const isOverflown = dateVal !== 'N/A';
                      
                      const formattedDate = isOverflown ? formatDate(dateVal) : dateVal;
                      
                      return (
                        <td key={year} className="p-3 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full font-black text-[8px] uppercase tracking-wider inline-block",
                            isOverflown 
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                              : "bg-white/5 text-white/20 border border-transparent"
                          )}>
                            {formattedDate}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="flex items-center space-x-2 text-[9px] text-white/30 italic">
            <HelpCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Select a lake marker on the map to inspect historical trend curves.</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
