import React from 'react';
import { type CalibrationConfig, type IMUData, DEFAULT_CALIBRATION } from '../utils/imuMath';
import { RotateCcw, Target } from 'lucide-react';

interface CalibrationPanelProps {
  config: CalibrationConfig;
  rawIMU: IMUData;
  onChange: (newConfig: CalibrationConfig) => void;
}

export const CalibrationPanel: React.FC<CalibrationPanelProps> = ({
  config,
  rawIMU,
  onChange,
}) => {
  // Tare current orientation as level (0, 0, 0)
  const handleTare = () => {
    onChange({
      ...config,
      pitchOffset: rawIMU.pitch,
      rollOffset: rawIMU.roll,
      yawOffset: rawIMU.yaw,
    });
  };

  const handleReset = () => {
    onChange(DEFAULT_CALIBRATION);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
          IMU Calibration & Axis Alignment
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTare}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Target className="w-3.5 h-3.5" />
            <span>Zero / Tare Level</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            title="Reset calibration offsets"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
        {/* Inversion Toggles */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/80 flex flex-col gap-2">
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase">Axis Inversions</span>
          <div className="flex flex-col gap-1.5 text-xs text-slate-700 dark:text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.invertPitch}
                onChange={(e) => onChange({ ...config, invertPitch: e.target.checked })}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Invert Pitch (Up/Down)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.invertRoll}
                onChange={(e) => onChange({ ...config, invertRoll: e.target.checked })}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Invert Roll (Left/Right)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.invertYaw}
                onChange={(e) => onChange({ ...config, invertYaw: e.target.checked })}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Invert Yaw (Heading)</span>
            </label>
          </div>
        </div>

        {/* Axis Mapping */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/80 flex flex-col gap-2">
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase">Sensor Mounting Orientation</span>
          <select
            value={config.axisMapping}
            onChange={(e) => onChange({ ...config, axisMapping: e.target.value as any })}
            className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md p-1.5 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-sky-500"
          >
            <option value="default">Standard (X: Pitch, Y: Roll, Z: Yaw)</option>
            <option value="swap_xy">Swap Pitch & Roll (Rotated 90°)</option>
            <option value="swap_yz">Swap Roll & Yaw</option>
            <option value="swap_xz">Swap Pitch & Yaw (Vertical mount)</option>
          </select>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
            Adjust when ESP32 IMU sensor is mounted sideways or rotated on your model.
          </span>
        </div>

        {/* Smoothing Filter */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/80 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-600 dark:text-slate-300 uppercase">Smoothing Filter</span>
            <span className="font-mono text-slate-700 dark:text-slate-200 font-bold">
              {Math.round(config.smoothingFactor * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="0.8"
            step="0.05"
            value={config.smoothingFactor}
            onChange={(e) => onChange({ ...config, smoothingFactor: parseFloat(e.target.value) })}
            className="w-full accent-sky-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>0% (Raw Instant)</span>
            <span>80% (Smooth Filtered)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
