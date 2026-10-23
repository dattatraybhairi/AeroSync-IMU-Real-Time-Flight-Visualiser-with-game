import React from 'react';
import { type IMUData } from '../utils/imuMath';

interface PrimaryFlightDisplayProps {
  imuData: IMUData;
}

export const PrimaryFlightDisplay: React.FC<PrimaryFlightDisplayProps> = ({ imuData }) => {
  const { pitch, roll, yaw, az } = imuData;

  // Pitch ladder vertical shift: ~1.8 pixels per degree of pitch
  const pitchOffsetPx = Math.max(-60, Math.min(60, pitch * 1.8));

  const getHeadingCompassLabel = (heading: number) => {
    const h = ((heading % 360) + 360) % 360;
    if (h >= 337.5 || h < 22.5) return 'N';
    if (h >= 22.5 && h < 67.5) return 'NE';
    if (h >= 67.5 && h < 112.5) return 'E';
    if (h >= 112.5 && h < 157.5) return 'SE';
    if (h >= 157.5 && h < 202.5) return 'S';
    if (h >= 202.5 && h < 247.5) return 'SW';
    if (h >= 247.5 && h < 292.5) return 'W';
    return 'NW';
  };

  const gForce = az ? (az / 9.81).toFixed(2) : '1.00';

  return (
    <div className="flex flex-col bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-md p-3 select-none w-60 transition-colors">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-100 dark:border-slate-800">
        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 tracking-wider">
          PRIMARY ATTITUDE
        </span>
        <span className="text-[10px] font-mono font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200/60 dark:border-amber-800/60">
          {gForce} G
        </span>
      </div>

      {/* Artificial Horizon Sphere / Gauge */}
      <div className="relative w-full h-36 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-900 shadow-inner flex items-center justify-center">
        {/* Rotating & Translating Horizon Disk */}
        <div
          className="absolute w-[220%] h-[220%] transition-transform duration-75 will-change-transform pointer-events-none"
          style={{
            transform: `rotate(${-roll}deg) translateY(${pitchOffsetPx}px)`,
          }}
        >
          {/* Sky (Top Half) */}
          <div className="w-full h-1/2 bg-gradient-to-b from-sky-600 to-sky-400" />
          {/* Ground (Bottom Half) */}
          <div className="w-full h-1/2 bg-gradient-to-t from-amber-950 to-amber-700" />

          {/* White Horizon Line */}
          <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-[2px] bg-white shadow-xs flex items-center justify-between px-6">
            <span className="text-[9px] font-mono text-white/90 font-bold">0°</span>
            <span className="text-[9px] font-mono text-white/90 font-bold">0°</span>
          </div>

          {/* Pitch Ladder Rungs */}
          {/* +20 deg */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[36px] flex items-center gap-1.5">
            <span className="text-[8px] font-mono font-bold text-white">20</span>
            <div className="w-12 h-[2px] bg-white/90" />
            <span className="text-[8px] font-mono font-bold text-white">20</span>
          </div>
          {/* +10 deg */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[18px] flex items-center gap-1.5">
            <span className="text-[8px] font-mono font-bold text-white">10</span>
            <div className="w-16 h-[2px] bg-white/90" />
            <span className="text-[8px] font-mono font-bold text-white">10</span>
          </div>

          {/* -10 deg */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-[18px] flex items-center gap-1.5">
            <span className="text-[8px] font-mono font-bold text-white/80">10</span>
            <div className="w-16 h-[2px] bg-white/70 border-t border-dashed border-white" />
            <span className="text-[8px] font-mono font-bold text-white/80">10</span>
          </div>
          {/* -20 deg */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-[36px] flex items-center gap-1.5">
            <span className="text-[8px] font-mono font-bold text-white/80">20</span>
            <div className="w-12 h-[2px] bg-white/70 border-t border-dashed border-white" />
            <span className="text-[8px] font-mono font-bold text-white/80">20</span>
          </div>
        </div>

        {/* Fixed Center Aircraft Reticle (Aviation Amber) */}
        <div className="absolute z-10 flex items-center justify-center pointer-events-none">
          <div className="w-7 h-1 bg-amber-400 border border-black/60 shadow-xs" />
          <div className="w-1 h-2.5 bg-amber-400 border border-black/60" />
          <div className="w-2 h-2 mx-2 rounded-full bg-amber-400 border-2 border-black/80" />
          <div className="w-1 h-2.5 bg-amber-400 border border-black/60" />
          <div className="w-7 h-1 bg-amber-400 border border-black/60 shadow-xs" />
        </div>

        {/* Top Roll Indicator Pointer */}
        <div className="absolute top-1 left-0 right-0 flex justify-center pointer-events-none">
          <div
            className="w-2.5 h-2.5 border-l-3 border-r-3 border-b-5 border-transparent border-b-amber-400"
            style={{ transform: `rotate(${-roll}deg)` }}
          />
        </div>
      </div>

      {/* Digital Values Strip */}
      <div className="grid grid-cols-3 gap-1.5 mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-center font-mono">
        <div className="bg-slate-50 dark:bg-slate-800/80 p-1 rounded border border-slate-200/80 dark:border-slate-700">
          <div className="text-[9px] font-sans font-semibold text-slate-500 dark:text-slate-400 uppercase">Pitch</div>
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {pitch >= 0 ? `+${pitch.toFixed(1)}` : pitch.toFixed(1)}°
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/80 p-1 rounded border border-slate-200/80 dark:border-slate-700">
          <div className="text-[9px] font-sans font-semibold text-slate-500 dark:text-slate-400 uppercase">Roll</div>
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {roll >= 0 ? `+${roll.toFixed(1)}` : roll.toFixed(1)}°
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/80 p-1 rounded border border-slate-200/80 dark:border-slate-700">
          <div className="text-[9px] font-sans font-semibold text-slate-500 dark:text-slate-400 uppercase">Yaw / Hdg</div>
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {Math.round(yaw).toString().padStart(3, '0')}° {getHeadingCompassLabel(yaw)}
          </div>
        </div>
      </div>
    </div>
  );
};
