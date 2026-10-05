import { motion } from 'motion/react';
import {
  HardHat,
  MousePointerSquareDashed,
  Loader2,
  AlertTriangle,
  CalendarClock,
  CloudOff,
  Layers3,
  RotateCcw,
  Globe,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { ConstructionCheckResponse } from '../lib/constructionApi';
import { resolveThumbnailUrl } from '../lib/constructionApi';
import { IconButton, Panel, PanelHeader } from './ui';
import { formatDate } from '../lib/date';

// ---------- Left deck: AOI drawing controls + run settings ----------

interface ConstructionControlPanelProps {
  hasAOI: boolean;
  isChecking: boolean;
  lookbackDays: number;
  setLookbackDays: (v: number) => void;
  baselineOffsetDays: number;
  setBaselineOffsetDays: (v: number) => void;
  maxCloudCover: number;
  setMaxCloudCover: (v: number) => void;
  onCheck: () => void;
  onClearAOI: () => void;
  error: string | null;
}

export function ConstructionControlPanel({
  hasAOI,
  isChecking,
  lookbackDays,
  setLookbackDays,
  baselineOffsetDays,
  setBaselineOffsetDays,
  maxCloudCover,
  setMaxCloudCover,
  onCheck,
  onClearAOI,
  error,
}: ConstructionControlPanelProps) {
  return (
    <Panel className="flex flex-col space-y-6 border-white/5">
      <PanelHeader icon={HardHat} title="Construction Monitor" status="Sentinel-2" statusTone="emerald" />

      <div className="glass glass-hover rounded-2xl p-4 border-dashed border-emerald-500/30 flex items-start space-x-3">
        <MousePointerSquareDashed className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-white/50 leading-relaxed">
          Use the draw tools in the bottom-right of the map to outline an area of interest
          (polygon or rectangle), then run a check below.
        </p>
      </div>

      <div className="flex items-center justify-between glass rounded-2xl px-4 py-3 border-white/5">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/40">AOI Status</span>
        <span
          className={cn(
            'text-[10px] font-black uppercase tracking-widest',
            hasAOI ? 'text-emerald-400' : 'text-white/30'
          )}
        >
          {hasAOI ? 'Ready' : 'Not drawn'}
        </span>
      </div>

      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <CalendarClock className="w-3.5 h-3.5 text-white/30" />
          <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Scene Search</h3>
        </div>

        <div className="space-y-3">
          <label className="block">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
                "After" lookback
              </span>
              <span className="text-[10px] font-black text-emerald-400">{lookbackDays}d</span>
            </div>
            <input
              type="range"
              min={7}
              max={180}
              value={lookbackDays}
              onChange={(e) => setLookbackDays(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </label>

          <label className="block">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
                Baseline offset
              </span>
              <span className="text-[10px] font-black text-emerald-400">{baselineOffsetDays}d</span>
            </div>
            <input
              type="range"
              min={30}
              max={730}
              step={10}
              value={baselineOffsetDays}
              onChange={(e) => setBaselineOffsetDays(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </label>

          <label className="block">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
                Max cloud cover
              </span>
              <span className="text-[10px] font-black text-emerald-400">{maxCloudCover}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={80}
              value={maxCloudCover}
              onChange={(e) => setMaxCloudCover(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="glass rounded-2xl p-3 border-rose-500/30 bg-rose-500/5 flex items-start space-x-2">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-rose-300/80 leading-relaxed">{error}</p>
        </div>
      )}

      <div className="flex items-center space-x-3">
        <button
          onClick={onCheck}
          disabled={!hasAOI || isChecking}
          className={cn(
            'ui-button-primary flex-1',
            !hasAOI || isChecking
              ? 'bg-white/5 text-white/20 cursor-not-allowed'
              : ''
          )}
        >
          {isChecking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <Layers3 className="w-4 h-4" />
              <span>Check Construction Activity</span>
            </>
          )}
        </button>
        {hasAOI && !isChecking && (
          <IconButton
            onClick={onClearAOI}
            label="Clear AOI"
          >
            <RotateCcw className="w-4 h-4 text-white/50" />
          </IconButton>
        )}
      </div>

      {isChecking && (
        <p className="text-[9px] text-white/30 text-center leading-relaxed">
          Fetching Sentinel-2 scenes and computing NDBI change — this can take up to a minute.
        </p>
      )}
    </Panel>
  );
}

// ---------- Right deck: results ----------

interface ConstructionResultsPanelProps {
  result: ConstructionCheckResponse | null;
  isChecking: boolean;
  clickedPoint?: { lat: number, lng: number, label: string } | null;
  isGeocoding?: boolean;
  onClearLocation?: () => void;
}

function scoreColor(score: number) {
  if (score >= 60) return 'text-rose-400';
  if (score >= 30) return 'text-amber-400';
  return 'text-emerald-400';
}

export function ConstructionResultsPanel({ 
  result, 
  isChecking,
  clickedPoint = null,
  isGeocoding = false,
  onClearLocation
}: ConstructionResultsPanelProps) {
  return (
    <Panel className="flex flex-col border-white/5 shadow-2xl max-h-[calc(100vh-12rem)] overflow-y-auto pr-3">
      <PanelHeader
        icon={HardHat}
        title="Construction Activity"
        status={result?.cached ? 'Cached' : undefined}
      />

      {clickedPoint && (
        <div className="glass rounded-2xl p-4 border-white/5 mb-6 relative overflow-hidden bg-white/[0.02]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400">
              <Globe className="w-3.5 h-3.5" />
              <span>Target Location</span>
            </div>
            {onClearLocation && (
              <IconButton
                onClick={onClearLocation}
                label="Close location inspector"
              >
                <X className="w-3.5 h-3.5 text-white/40 hover:text-white" />
              </IconButton>
            )}
          </div>
          {isGeocoding ? (
            <div className="flex items-center space-x-2 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 animate-pulse">Resolving address...</span>
            </div>
          ) : (
            <h4 className="text-sm font-bold text-white leading-tight">{clickedPoint.label}</h4>
          )}
          <div className="mt-2.5 pt-2.5 border-t border-white/5 flex items-center space-x-4 text-[9px] font-mono text-white/30">
            <span>LAT: {clickedPoint.lat.toFixed(4)}</span>
            <span>LNG: {clickedPoint.lng.toFixed(4)}</span>
          </div>
        </div>
      )}

      {!result && !isChecking && (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-12">
          <HardHat className="w-8 h-8 text-white/10" />
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-bold max-w-[200px]">
            Draw an AOI and run a check to see results here
          </p>
        </div>
      )}

      {isChecking && (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-12">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
            Comparing Sentinel-2 scenes...
          </p>
        </div>
      )}

      {result && result.status === 'no_scenes_found' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-12">
          <CloudOff className="w-8 h-8 text-white/20" />
          <p className="text-xs font-bold text-white/50 max-w-[220px] leading-relaxed">
            {result.message || 'No cloud-free scenes found for this area/date range.'}
          </p>
        </div>
      )}

      {result && result.status === 'ok' && (
        <div className="space-y-6">
          {/* Score */}
          <div>
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">
              Activity Score
            </p>
            <div className="flex items-baseline space-x-2">
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('text-5xl font-black tracking-tighter', scoreColor(result.score))}
              >
                {result.score}
              </motion.p>
              <p className="text-xs font-bold text-white/40 uppercase tracking-widest">/ 100</p>
            </div>
            <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden mt-3">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${result.score}%` }}
                className={cn(
                  'h-full',
                  result.score >= 60 ? 'bg-rose-400' : result.score >= 30 ? 'bg-amber-400' : 'bg-emerald-400'
                )}
              />
            </div>
          </div>

          {/* Acquisition dates — shown for transparency since these aren't live images */}
          <div className="pt-4 border-t border-white/10 grid grid-cols-2 gap-3">
            <div className="glass p-3 rounded-xl border-white/5">
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1">Before</p>
              <p className="text-xs font-mono text-white/70">{formatDate(result.before_scene?.date)}</p>
              <p className="text-[8px] text-white/30 mt-0.5">{result.before_scene?.cloud_cover.toFixed(1)}% cloud</p>
            </div>
            <div className="glass p-3 rounded-xl border-white/5">
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1">After</p>
              <p className="text-xs font-mono text-emerald-400">{formatDate(result.after_scene?.date)}</p>
              <p className="text-[8px] text-white/30 mt-0.5">{result.after_scene?.cloud_cover.toFixed(1)}% cloud</p>
            </div>
          </div>

          {/* Thumbnails */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1.5">Before</p>
              <div className="aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/30">
                {result.before_thumbnail_url && (
                  <img
                    src={resolveThumbnailUrl(result.before_thumbnail_url)}
                    alt="Before satellite thumbnail"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            </div>
            <div>
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1.5">After</p>
              <div className="aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/30">
                {result.after_thumbnail_url && (
                  <img
                    src={resolveThumbnailUrl(result.after_thumbnail_url)}
                    alt="After satellite thumbnail"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          {result.stats && (
            <div className="pt-4 border-t border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
                  New built-up area
                </span>
                <span className="text-xs font-black text-white/80">
                  {Math.round(result.stats.change_area_m2).toLocaleString()} m²
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">% of AOI</span>
                <span className="text-xs font-black text-white/80">
                  {result.stats.change_area_pct_of_aoi.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
                  Change polygons
                </span>
                <span className="text-xs font-black text-white/80">{result.stats.polygon_count}</span>
              </div>
            </div>
          )}

          <p className="text-[8px] text-white/25 leading-relaxed pt-2">
            Based on Sentinel-2 L2A imagery — not live/real-time. Orange overlays on the map show
            areas of NDBI increase (likely new built-up land) between the two dates above.
          </p>
        </div>
      )}
    </Panel>
  );
}
