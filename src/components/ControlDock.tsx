import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Plane,
  Radio,
  Settings,
  Crosshair,
  Grid,
  Mountain,
  Cloud,
  RotateCcw,
} from 'lucide-react';
import { type AircraftType, type CameraPreset, type TerrainMode } from './AeroViewport';
import { AIRCRAFT_CATALOG } from '../three/aircraftModels';
import { ConnectionManager, type DataSourceType } from './ConnectionManager';
import { CalibrationPanel } from './CalibrationPanel';
import { type CalibrationConfig, type IMUData } from '../utils/imuMath';

interface ControlDockProps {
  selectedAircraft: AircraftType;
  setSelectedAircraft: (type: AircraftType) => void;
  cameraPreset: CameraPreset;
  setCameraPreset: (preset: CameraPreset) => void;
  showAxes: boolean;
  setShowAxes: (show: boolean) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  terrainMode: TerrainMode;
  setTerrainMode: (mode: TerrainMode) => void;
  onResetFlight: () => void;
  currentSource: DataSourceType;
  setCurrentSource: (source: DataSourceType) => void;
  onReceiveRawData: (data: IMUData, rawText?: string) => void;
  isSimulating: boolean;
  setIsSimulating: (sim: boolean) => void;
  calibrationConfig: CalibrationConfig;
  setCalibrationConfig: (cfg: CalibrationConfig) => void;
  rawIMU: IMUData;
  activeTab: 'aircraft' | 'connection' | 'calibration';
  setActiveTab: (tab: 'aircraft' | 'connection' | 'calibration') => void;
}

export const ControlDock: React.FC<ControlDockProps> = ({
  selectedAircraft,
  setSelectedAircraft,
  cameraPreset,
  setCameraPreset,
  showAxes,
  setShowAxes,
  showGrid,
  setShowGrid,
  terrainMode,
  setTerrainMode,
  onResetFlight,
  currentSource,
  setCurrentSource,
  onReceiveRawData,
  isSimulating,
  setIsSimulating,
  calibrationConfig,
  setCalibrationConfig,
  rawIMU,
  activeTab,
  setActiveTab,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const currentMeta =
    AIRCRAFT_CATALOG.find((a) => a.id === selectedAircraft) || AIRCRAFT_CATALOG[0];

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[94vw] max-w-4xl transition-transform duration-300 pointer-events-auto">
      {/* Collapse / Expand Tab Bar */}
      <div className="flex justify-center -mb-[1px]">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 px-4 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700 rounded-t-lg shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {collapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              <span>Show Flight Deck Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              <span>Hide Controls (Zen Mode)</span>
            </>
          )}
        </button>
      </div>

      {/* Main Dock Container */}
      <div
        className={`bg-white/95 dark:bg-slate-900/95 border border-slate-300/80 dark:border-slate-700/80 rounded-2xl shadow-xl p-4 flex flex-col gap-3 transition-colors ${
          collapsed ? 'hidden' : 'flex'
        }`}
      >
        {/* Dock Header & Tab Navigation */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('aircraft')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'aircraft'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Plane className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>Fleet & 3D Terrain</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('connection')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'connection'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>ESP32 Joystick + IMU Source</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('calibration')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'calibration'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Settings className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>IMU Axis Calibration</span>
            </button>
          </div>

          {/* Active Aircraft Telemetry Spec */}
          <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">
            <span className="font-semibold text-slate-800 dark:text-slate-200">{currentMeta.code}</span>
            <span>·</span>
            <span>{currentMeta.wingspan}</span>
            <span>·</span>
            <span className="text-sky-700 dark:text-sky-400 font-semibold uppercase">{currentSource}</span>
          </div>
        </div>

        {/* Tab 1: Single Active Aircraft Selector, Terrain Mode & Camera Views */}
        {activeTab === 'aircraft' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
            {/* Airbus & Boeing Single-Active Aircraft Selector */}
            <div className="md:col-span-7 flex flex-col gap-1.5 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/80">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Active Aircraft (Single Airframe Focus):
                </span>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-[230px]">
                  {currentMeta.engines} · {currentMeta.description}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-0.5">
                {AIRCRAFT_CATALOG.map((ac) => {
                  const isSelected = selectedAircraft === ac.id;
                  return (
                    <button
                      key={ac.id}
                      type="button"
                      onClick={() => setSelectedAircraft(ac.id)}
                      className={`flex flex-col items-start py-1.5 px-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-900 dark:bg-sky-600 border-slate-900 dark:border-sky-500 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={`text-[10px] font-mono font-semibold uppercase ${
                            isSelected ? 'text-sky-400 dark:text-sky-100' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {ac.manufacturer} · {ac.code}
                        </span>
                      </div>
                      <span className="font-semibold text-xs truncate w-full">{ac.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Camera Presets, 3D Terrain World (Mountains / Clouds Only / Off) & Gimbal Toggles */}
            <div className="md:col-span-5 flex flex-col justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/80">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    Flight Camera Angle:
                  </span>
                  <button
                    type="button"
                    onClick={onResetFlight}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset to Runway</span>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: 'chase', label: 'Tail Chase' },
                    { id: 'isometric', label: '3/4 Front' },
                    { id: 'cockpit_front', label: 'Nose View' },
                    { id: 'wing_view', label: 'Wing & Eng' },
                    { id: 'side', label: 'Profile' },
                    { id: 'top', label: 'Top Radar' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCameraPreset(p.id as CameraPreset)}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        cameraPreset === p.id
                          ? 'bg-sky-600 text-white font-semibold'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTerrainMode('mountains')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                      terrainMode === 'mountains'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Mountain className="w-3 h-3" />
                    <span>Mountains</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTerrainMode('clouds_only')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                      terrainMode === 'clouds_only'
                        ? 'bg-sky-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Cloud className="w-3 h-3" />
                    <span>Clouds Only</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTerrainMode('off')}
                    className={`px-1.5 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                      terrainMode === 'off'
                        ? 'bg-slate-700 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <span>Off</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showAxes}
                      onChange={(e) => setShowAxes(e.target.checked)}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <Crosshair className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                    <span>Gimbal</span>
                  </label>

                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showGrid}
                      onChange={(e) => setShowGrid(e.target.checked)}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <Grid className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                    <span>Grid</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Connection & Simulation (Always mounted so serial/socket/sim streams never drop when switching tabs) */}
        <div className={activeTab === 'connection' ? 'block' : 'hidden'}>
          <ConnectionManager
            currentSource={currentSource}
            onSourceChange={setCurrentSource}
            onReceiveRawData={onReceiveRawData}
            isSimulating={isSimulating}
            setIsSimulating={setIsSimulating}
          />
        </div>

        {/* Tab 3: Calibration */}
        {activeTab === 'calibration' && (
          <CalibrationPanel
            config={calibrationConfig}
            rawIMU={rawIMU}
            onChange={setCalibrationConfig}
          />
        )}
      </div>
    </div>
  );
};
