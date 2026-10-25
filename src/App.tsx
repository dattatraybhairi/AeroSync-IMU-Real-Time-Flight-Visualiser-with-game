import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TopNav } from './components/TopNav';
import {
  AeroViewport,
  type AircraftType,
  type CameraPreset,
  type TerrainMode,
} from './components/AeroViewport';
import { AIRCRAFT_CATALOG } from './three/aircraftModels';
import { PrimaryFlightDisplay } from './components/PrimaryFlightDisplay';
import { TelemetryScope } from './components/TelemetryScope';
import { JoystickRemoteHUD } from './components/JoystickRemoteHUD';
import { ControlDock } from './components/ControlDock';
import { HardwareCodeModal } from './components/HardwareCodeModal';
import {
  type IMUData,
  type CalibrationConfig,
  DEFAULT_CALIBRATION,
  applyCalibration,
  computeTareCalibration,
} from './utils/imuMath';
import {
  INITIAL_FLIGHT_STATE,
  type FlightPositionState,
  type JoystickInput,
} from './utils/flightPhysics';
import { type DataSourceType } from './components/ConnectionManager';
import { ChevronRight, ChevronLeft, Activity, Gauge, Gamepad2 } from 'lucide-react';

export default function App() {
  // Theme state (default Dark Mode, with toggle & localStorage persistence)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('aerosync_theme');
      return saved ? saved === 'dark' : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('aerosync_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  // IMU Data states
  const [rawIMU, setRawIMU] = useState<IMUData>({
    pitch: 0,
    roll: 0,
    yaw: 0,
    timestamp: Date.now(),
  });
  const rawIMURef = useRef<IMUData>(rawIMU);
  rawIMURef.current = rawIMU;

  const [calibrationConfig, setCalibrationConfig] =
    useState<CalibrationConfig>(DEFAULT_CALIBRATION);
  const calibrationConfigRef = useRef<CalibrationConfig>(calibrationConfig);
  calibrationConfigRef.current = calibrationConfig;

  const prevCalibratedRef = useRef<IMUData>({
    pitch: 0,
    roll: 0,
    yaw: 0,
    timestamp: Date.now(),
  });

  const [calibratedIMU, setCalibratedIMU] = useState<IMUData>(prevCalibratedRef.current);
  const [calibratedFlash, setCalibratedFlash] = useState<boolean>(false);
  const prevJoyBtnRef = useRef<boolean>(false);
  const needsAutoTareOnHardwareRef = useRef<boolean>(true);

  // Custom Flight Remote (Stops at one place until joystick moves; turns + moves forward/backward with joystick)
  const [remoteInput, setRemoteInput] = useState<JoystickInput>({
    joyX: 0,
    joyY: 0,
    autoCruise: false,
    cruiseThrottle: 0.65,
    boost: false,
    swapVRxVRy: true,
    reverseX: true,
    reverseY: true,
    turnOnSideways: true,
  });

  const [flightState, setFlightState] = useState<FlightPositionState>(INITIAL_FLIGHT_STATE);
  const [resetCounter, setResetCounter] = useState<number>(0);

  // Connection & Simulation states
  const [currentSource, setCurrentSource] = useState<DataSourceType>('simulation');
  const currentSourceRef = useRef<DataSourceType>(currentSource);
  currentSourceRef.current = currentSource;
  const [isSimulating, setIsSimulating] = useState<boolean>(true);

  // Single Active Aircraft, Terrain Mode ('mountains' | 'clouds_only' | 'off') & Camera states
  const [selectedAircraft, setSelectedAircraft] = useState<AircraftType>('airbus_a350');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('chase');
  const [showAxes, setShowAxes] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [terrainMode, setTerrainMode] = useState<TerrainMode>('mountains');

  // HUD & Dock states
  const [hudView, setHudView] = useState<'remote' | 'pfd' | 'scope'>('remote');
  const [hudCollapsed, setHudCollapsed] = useState<boolean>(false);
  const [codeModalOpen, setCodeModalOpen] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<string>('fleet');
  const [dockTab, setDockTab] = useState<'aircraft' | 'connection' | 'calibration'>('aircraft');

  // Packet Rate Counter (Hz)
  const [packetRate, setPacketRate] = useState<number>(40);
  const packetCountRef = useRef<number>(0);

  // Calibrate current IMU position as (0°, 0°, 0°) level reference
  const handleCalibrateIMU = useCallback((sample?: IMUData) => {
    const targetRaw = sample || rawIMURef.current;
    const nextCfg = computeTareCalibration(targetRaw, calibrationConfigRef.current);
    calibrationConfigRef.current = nextCfg;
    setCalibrationConfig(nextCfg);

    const zeroed: IMUData = {
      ...targetRaw,
      pitch: 0,
      roll: 0,
      yaw: 0,
      timestamp: Date.now(),
    };
    prevCalibratedRef.current = zeroed;
    setCalibratedIMU(zeroed);
    setCalibratedFlash(true);
    window.setTimeout(() => setCalibratedFlash(false), 1800);
  }, []);

  // Keyboard shortcut 'C' to calibrate current IMU position at any time
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement | null)?.tagName;
      if (targetTag && ['INPUT', 'SELECT', 'TEXTAREA'].includes(targetTag)) return;
      if (e.key === 'c' || e.key === 'C') {
        handleCalibrateIMU();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCalibrateIMU]);

  const handleReceiveRawData = useCallback(
    (data: IMUData) => {
      packetCountRef.current += 1;
      rawIMURef.current = data;
      setRawIMU(data);

      let activeCfg = calibrationConfigRef.current;

      // 1. Auto-calibrate on the first incoming hardware packet (WebSerial / WebSocket)
      //    so arbitrary sensor mounting angles (e.g. -84.6°, -19.3°, 223.5°) start at a clean (0°, 0°, 0°)!
      if (
        needsAutoTareOnHardwareRef.current &&
        (currentSourceRef.current === 'webserial' || currentSourceRef.current === 'websocket') &&
        (Math.abs(data.pitch) > 0.01 || Math.abs(data.roll) > 0.01 || Math.abs(data.yaw) > 0.01)
      ) {
        needsAutoTareOnHardwareRef.current = false;
        activeCfg = computeTareCalibration(data, activeCfg);
        calibrationConfigRef.current = activeCfg;
        setCalibrationConfig(activeCfg);
        setCalibratedFlash(true);
        window.setTimeout(() => setCalibratedFlash(false), 1800);
      }

      // 2. Physical ESP32 GPIO Button Calibration Trigger (column 9 joyBtn === true)
      const isBtnPressed = Boolean(data.joyBtn);
      if (isBtnPressed && !prevJoyBtnRef.current) {
        activeCfg = computeTareCalibration(data, activeCfg);
        calibrationConfigRef.current = activeCfg;
        setCalibrationConfig(activeCfg);
        setCalibratedFlash(true);
        window.setTimeout(() => setCalibratedFlash(false), 1800);
      }
      prevJoyBtnRef.current = isBtnPressed;

      const calibrated = applyCalibration(data, activeCfg, prevCalibratedRef.current);
      prevCalibratedRef.current = calibrated;
      setCalibratedIMU(calibrated);
    },
    []
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setPacketRate(packetCountRef.current);
      packetCountRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleChangeSource = useCallback((nextSource: DataSourceType) => {
    currentSourceRef.current = nextSource;
    setCurrentSource(nextSource);
    needsAutoTareOnHardwareRef.current =
      nextSource === 'webserial' || nextSource === 'websocket';

    if (nextSource === 'simulation') {
      calibrationConfigRef.current = DEFAULT_CALIBRATION;
      setCalibrationConfig(DEFAULT_CALIBRATION);
    }

    // Keep autoCruise OFF by default across all sources so the aircraft stops at one place until moved by the joystick
    setRemoteInput((prev) => ({
      ...prev,
      joyX: 0,
      joyY: 0,
      autoCruise: false,
    }));
    const zeroed: IMUData = {
      pitch: 0,
      roll: 0,
      yaw: 0,
      joyX: 0,
      joyY: 0,
      timestamp: Date.now(),
    };
    prevCalibratedRef.current = zeroed;
    setRawIMU(zeroed);
    setCalibratedIMU(zeroed);
  }, []);

  const handleNavigateSection = (
    section: 'fleet' | 'device_imu' | 'serial' | 'calibration'
  ) => {
    setActiveSection(section);
    if (section === 'fleet') {
      setDockTab('aircraft');
    } else if (section === 'device_imu') {
      handleChangeSource('device_imu');
      setDockTab('connection');
    } else if (section === 'serial') {
      handleChangeSource('webserial');
      setDockTab('connection');
    } else if (section === 'calibration') {
      setDockTab('calibration');
    }
  };

  const handleResetFlight = useCallback(() => {
    setResetCounter((c) => c + 1);
    setRemoteInput((prev) => ({
      ...prev,
      joyX: 0,
      joyY: 0,
    }));
  }, []);

  const activeMeta =
    AIRCRAFT_CATALOG.find((a) => a.id === selectedAircraft) || AIRCRAFT_CATALOG[0];

  const sourceLabel =
    currentSource === 'device_imu'
      ? 'LOCAL DEVICE IMU'
      : currentSource === 'webserial'
      ? 'WEBSERIAL ESP32 + JOYSTICK'
      : currentSource === 'websocket'
      ? 'WEBSOCKET PYTHON'
      : 'FLIGHT SIMULATION';

  return (
    <div
      className={`relative w-screen h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans ${
        darkMode ? 'dark' : ''
      }`}
    >
      {/* 1. Top Navigation Bar */}
      <TopNav
        onOpenCodeModal={() => setCodeModalOpen(true)}
        onNavigateSection={handleNavigateSection}
        activeSection={activeSection}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
      />

      {/* 2. Main 3D Single-Aircraft & Terrain Flight Simulator Viewport */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        <AeroViewport
          imuData={calibratedIMU}
          selectedAircraft={selectedAircraft}
          cameraPreset={cameraPreset}
          showAxes={showAxes}
          showGrid={showGrid}
          terrainMode={terrainMode}
          darkMode={darkMode}
          remoteInput={remoteInput}
          resetCounter={resetCounter}
          onFlightStateUpdate={setFlightState}
        />

        {/* 3. Floating Left Instrument & Custom Remote HUD */}
        <div
          className={`absolute top-4 left-4 z-20 flex flex-col gap-2 transition-transform duration-300 pointer-events-auto ${
            hudCollapsed ? '-translate-x-[calc(100%-28px)]' : 'translate-x-0'
          }`}
        >
          <div className="relative flex items-start gap-1">
            <div className="flex flex-col gap-2">
              {/* HUD Mode Switcher */}
              <div className="flex items-center gap-1 p-0.5 bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-lg shadow-xs text-[11px] font-semibold text-slate-600 dark:text-slate-400 self-start">
                <button
                  type="button"
                  onClick={() => setHudView('remote')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    hudView === 'remote'
                      ? 'bg-slate-900 dark:bg-sky-600 text-white font-bold'
                      : 'hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Gamepad2 className="w-3 h-3 text-amber-400 dark:text-white" />
                  <span>Remote & PFD</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHudView('pfd')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    hudView === 'pfd'
                      ? 'bg-slate-900 dark:bg-sky-600 text-white font-bold'
                      : 'hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Gauge className="w-3 h-3 text-sky-400 dark:text-white" />
                  <span>PFD Only</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHudView('scope')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    hudView === 'scope'
                      ? 'bg-slate-900 dark:bg-sky-600 text-white font-bold'
                      : 'hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Activity className="w-3 h-3 text-emerald-400 dark:text-white" />
                  <span>Scope</span>
                </button>
              </div>

              <div className="flex flex-col lg:flex-row items-start gap-2">
                {/* Custom ESP32 Flight Remote Controller (Joystick + Forward/Backward/Left/Right + GPIO IMU Calibration) */}
                {hudView === 'remote' && (
                  <div className="w-[264px]">
                    <JoystickRemoteHUD
                      remoteInput={remoteInput}
                      onChangeRemote={setRemoteInput}
                      flightState={flightState}
                      totalRings={8}
                      onResetFlight={handleResetFlight}
                      terrainMode={terrainMode}
                      onChangeTerrainMode={setTerrainMode}
                      espJoyX={calibratedIMU.joyX}
                      espJoyY={calibratedIMU.joyY}
                      onCalibrateIMU={() => handleCalibrateIMU()}
                      calibratedFlash={calibratedFlash}
                    />
                  </div>
                )}

                {/* Primary Flight Display */}
                {(hudView === 'pfd' || hudView === 'remote') && (
                  <div className="w-[250px]">
                    <PrimaryFlightDisplay imuData={calibratedIMU} />
                  </div>
                )}

                {/* Telemetry Scope */}
                {hudView === 'scope' && (
                  <div className="w-[260px]">
                    <TelemetryScope
                      imuData={calibratedIMU}
                      packetRate={packetRate}
                      darkMode={darkMode}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Minimize / Expand Toggle */}
            <button
              type="button"
              onClick={() => setHudCollapsed(!hudCollapsed)}
              aria-label={
                hudCollapsed
                  ? 'Show Flight Instruments HUD'
                  : 'Collapse Flight Instruments HUD'
              }
              className="mt-1 p-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-r-lg shadow-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              title={
                hudCollapsed
                  ? 'Show Flight Instruments HUD'
                  : 'Collapse Flight Instruments HUD'
              }
            >
              {hudCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* 4. Top-Right Active Aircraft & Flight Simulator Telemetry Readout */}
        <div className="absolute top-4 right-4 z-20 hidden sm:flex flex-col items-end gap-1.5 pointer-events-none select-none">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-lg shadow-xs text-xs font-mono text-slate-700 dark:text-slate-300">
            <span className="font-bold text-slate-900 dark:text-white">{activeMeta.name}</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span>{activeMeta.code}</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="text-sky-600 dark:text-sky-400 font-bold">{sourceLabel}</span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 bg-white/90 dark:bg-slate-900/90 px-2.5 py-1 rounded border border-slate-200/80 dark:border-slate-800 font-mono tabular-nums">
            <span>SPD: {flightState.airspeedKts} KT</span>
            <span>·</span>
            <span>ALT: {flightState.altitudeFt} FT</span>
            <span>·</span>
            <span>HDG: {Math.round(flightState.headingDeg).toString().padStart(3, '0')}°</span>
            <span>·</span>
            <span>P: {calibratedIMU.pitch >= 0 ? `+${calibratedIMU.pitch.toFixed(1)}` : calibratedIMU.pitch.toFixed(1)}°</span>
            <span>·</span>
            <span>R: {calibratedIMU.roll >= 0 ? `+${calibratedIMU.roll.toFixed(1)}` : calibratedIMU.roll.toFixed(1)}°</span>
          </div>
        </div>

        {/* 5. Collapsible Bottom Control Dock */}
        <ControlDock
          selectedAircraft={selectedAircraft}
          setSelectedAircraft={setSelectedAircraft}
          cameraPreset={cameraPreset}
          setCameraPreset={setCameraPreset}
          showAxes={showAxes}
          setShowAxes={setShowAxes}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          terrainMode={terrainMode}
          setTerrainMode={setTerrainMode}
          onResetFlight={handleResetFlight}
          currentSource={currentSource}
          setCurrentSource={handleChangeSource}
          onReceiveRawData={handleReceiveRawData}
          isSimulating={isSimulating}
          setIsSimulating={setIsSimulating}
          calibrationConfig={calibrationConfig}
          setCalibrationConfig={(cfg) => {
            calibrationConfigRef.current = cfg;
            setCalibrationConfig(cfg);
          }}
          rawIMU={rawIMU}
          calibratedIMU={calibratedIMU}
          onCalibrateIMU={() => handleCalibrateIMU()}
          calibratedFlash={calibratedFlash}
          activeTab={dockTab}
          setActiveTab={setDockTab}
        />
      </main>

      {/* 6. Hardware Firmware & Python Bridge Code Modal */}
      <HardwareCodeModal
        isOpen={codeModalOpen}
        onClose={() => setCodeModalOpen(false)}
      />
    </div>
  );
}
