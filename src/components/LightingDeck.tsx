import { Moon, Info, Globe, X, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import type { LightingCheckResponse } from '../lib/lightingApi';
import { IconButton, Panel, PanelHeader } from './ui';
import { formatDate } from '../lib/date';

interface LightingControlPanelProps {}

export function LightingControlPanel({}: LightingControlPanelProps) {
  return (
    <Panel className="flex flex-col space-y-6 border-white/5">
      <PanelHeader icon={Moon} title="Nighttime Lighting" status="VIIRS" statusTone="indigo" />

      <div className="glass glass-hover rounded-2xl p-4 border-dashed border-indigo-500/30 flex items-start space-x-3">
        <Info className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-white/50 leading-relaxed">
          Based on NASA VIIRS satellite data, ~500m resolution, one reading per night (~1:30 AM pass).
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Classification Legend</h3>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-start space-x-3 p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-emerald-400">Normally Lit</p>
              <p className="text-[9px] text-white/40 mt-0.5">Radiance is consistent with historical baseline.</p>
            </div>
          </div>
          <div className="flex items-start space-x-3 p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-amber-400">Dimmer Than Usual</p>
              <p className="text-[9px] text-white/40 mt-0.5">Recent readings show a significant drop in light.</p>
            </div>
          </div>
          <div className="flex items-start space-x-3 p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-rose-400">Chronically Under-Lit</p>
              <p className="text-[9px] text-white/40 mt-0.5">Sustained period of low light or outage detected.</p>
            </div>
          </div>
          <div className="flex items-start space-x-3 p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-500 mt-1 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-gray-400">Not Evaluated</p>
              <p className="text-[9px] text-white/40 mt-0.5">Natural area (park, water, etc) not assessed for adequacy.</p>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ---------- Right deck: Results & analytics ----------

interface LightingResultsPanelProps {
  result: LightingCheckResponse | null;
  isLoading: boolean;
  error: string | null;
  clickedPoint: { lat: number; lng: number; label: string } | null;
  isGeocoding: boolean;
  onClearLocation: () => void;
}

export function LightingResultsPanel({
  result,
  isLoading,
  error,
  clickedPoint,
  isGeocoding,
  onClearLocation,
}: LightingResultsPanelProps) {
  if (!clickedPoint) return null;

  return (
    <Panel className="flex flex-col max-h-[calc(100vh-12rem)] overflow-y-auto pr-3 border-white/5 shadow-2xl">
      <PanelHeader icon={Moon} title="Location Selected" status="Live" statusTone="indigo" />

      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-black tracking-tighter text-indigo-400 uppercase italic">Location Details</h4>
          <IconButton
            onClick={onClearLocation}
            label="Close location inspector"
          >
            <X className="w-4 h-4 text-white/40 hover:text-white" />
          </IconButton>
        </div>
        
        {isGeocoding ? (
          <div className="flex items-center space-x-2 py-1 mb-4">
            <div className="w-4 h-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/45 animate-pulse">Resolving location...</span>
          </div>
        ) : (
          <h3 className="text-xl font-black tracking-tighter text-white uppercase italic leading-none mb-4 truncate">
            {clickedPoint.label}
          </h3>
        )}

        <div className="space-y-4">
          {isLoading ? (
            <div className="glass p-8 rounded-2xl border-white/5 flex flex-col items-center justify-center space-y-3">
              <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest animate-pulse">
                Fetching Radiance Data...
              </p>
            </div>
          ) : error ? (
            <div className="glass p-4 rounded-2xl border-rose-500/20 bg-rose-500/5">
              <p className="text-xs text-rose-400 font-bold">{error}</p>
            </div>
          ) : result ? (
            <div className="ui-card space-y-4 bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-white/40">Status</span>
                <div className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-bold border",
                  result.classification === 'Normally lit' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                  result.classification === 'Dimmer than usual' ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                  result.classification === 'Chronically under-lit' ? "bg-rose-500/20 text-rose-400 border-rose-500/30" :
                  "bg-gray-500/20 text-gray-400 border-gray-500/30"
                )}>
                  {result.classification}
                </div>
              </div>

              {result.classification === 'Not evaluated - natural area' ? (
                <p className="text-[10px] text-white/50 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">
                  This area is classified as park/water/green space and isn't evaluated for lighting adequacy.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="ui-card bg-black/20">
                      <p className="text-[8px] text-white/40 uppercase font-bold mb-1">Latest Reading</p>
                      <p className="text-sm font-black text-white">{result.radiance_value}</p>
                      <p className="text-[8px] text-indigo-400 mt-1">{formatDate(result.date_used)}</p>
                    </div>
                    <div className="ui-card bg-black/20">
                      <p className="text-[8px] text-white/40 uppercase font-bold mb-1">90-Day Baseline</p>
                      <p className="text-sm font-black text-white">{result.baseline_average}</p>
                      <p className="text-[8px] text-white/30 mt-1">Average</p>
                    </div>
                  </div>

                  {result.is_baseline_seeded && (
                    <div className="mt-2 flex items-start space-x-2 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg">
                      <Activity className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                      <p className="text-[8px] text-amber-400/80 leading-tight">
                        Baseline data: partially historical estimate, building toward full satellite record.
                      </p>
                    </div>
                  )}

                  {result.history && result.history.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-3">Historical Trend</p>
                      <Sparkline history={result.history} />
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="ui-card flex flex-col items-center text-center opacity-50">
              <Globe className="w-8 h-8 text-white/20 mb-2" />
              <p className="text-[10px] text-white/40">Select a location to view lighting metrics</p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Sparkline({ history }: { history: NonNullable<LightingCheckResponse['history']> }) {
  if (!history || history.length === 0) return null;
  
  // history is sorted desc by date, so reverse it for the chart (left to right = oldest to newest)
  const data = [...history].reverse();
  
  const minVal = Math.min(...data.map(d => d.radiance));
  const maxVal = Math.max(...data.map(d => d.radiance));
  const range = maxVal - minVal || 1;
  
  const width = 200;
  const height = 40;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d.radiance - minVal) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <div className="w-full mt-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-10 overflow-visible">
        <polyline
          fill="none"
          stroke="rgba(99, 102, 241, 0.5)"
          strokeWidth="2"
          points={points}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Draw points */}
        {data.map((d, i) => {
          const x = (i / (data.length - 1)) * width;
          const y = height - ((d.radiance - minVal) / range) * height;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="1.5"
              fill={d.is_seeded ? "rgba(251, 191, 36, 0.8)" : "rgba(99, 102, 241, 1)"}
            />
          );
        })}
      </svg>
      <div className="flex justify-between mt-1 px-1">
        <span className="text-[7px] text-white/30">{formatDate(data[0]?.date)}</span>
        <span className="text-[7px] text-white/30">{formatDate(data[data.length - 1]?.date)}</span>
      </div>
    </div>
  );
}
