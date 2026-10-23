import React, { useState, useEffect, useRef } from 'react';
import {
  type IMUData,
  parseIMUString,
  generateSimulatedAttitude,
  deviceOrientationToIMU,
  accelerometerToAttitude,
} from '../utils/imuMath';
import {
  Smartphone,
  Cable,
  Wifi,
  Play,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Compass,
  MousePointer,
} from 'lucide-react';

export type DataSourceType = 'device_imu' | 'simulation' | 'webserial' | 'websocket';

interface ConnectionManagerProps {
  currentSource: DataSourceType;
  onSourceChange: (source: DataSourceType) => void;
  onReceiveRawData: (data: IMUData, rawText?: string) => void;
  isSimulating: boolean;
  setIsSimulating: (sim: boolean) => void;
}

export const ConnectionManager: React.FC<ConnectionManagerProps> = ({
  currentSource,
  onSourceChange,
  onReceiveRawData,
  isSimulating,
  setIsSimulating,
}) => {
  // 1. Local Device IMU state (Phone / Tablet / Laptop)
  const [deviceSensorStatus, setDeviceSensorStatus] = useState<
    'idle' | 'listening_hardware' | 'trackpad_fallback' | 'permission_denied'
  >('idle');
  const [hardwareEventsReceived, setHardwareEventsReceived] = useState(0);
  const [trackpadTiltEnabled, setTrackpadTiltEnabled] = useState(true);
  const [trackpadPos, setTrackpadPos] = useState({ pitch: 0, roll: 0, yaw: 0 });
  const latestAccelRef = useRef<{ x?: number | null; y?: number | null; z?: number | null }>({});
  const latestRotRateRef = useRef<{ alpha?: number | null; beta?: number | null; gamma?: number | null }>({});
  const hardwareActiveRef = useRef(false);

  // 2. WebSerial state
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialBaud, setSerialBaud] = useState(115200);
  const [serialError, setSerialError] = useState<string | null>(null);
  const serialPortRef = useRef<any>(null);
  const serialReaderRef = useRef<any>(null);

  // 3. WebSocket state
  const [wsUrl, setWsUrl] = useState('ws://localhost:8765');
  const [wsConnected, setWsConnected] = useState(false);
  const [wsConnecting, setWsConnecting] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // 4. Simulation state
  const [simManeuver, setSimManeuver] = useState<
    'level' | 'climb_dive' | 'barrel_roll' | 'turbulence' | 'figure8'
  >('climb_dive');
  const [manualMode, setManualMode] = useState(false);
  const [manualPitch, setManualPitch] = useState(0);
  const [manualRoll, setManualRoll] = useState(0);
  const [manualYaw, setManualYaw] = useState(0);

  // Raw serial/websocket line log buffer
  const [recentLines, setRecentLines] = useState<string[]>([]);

  const appendLog = (line: string) => {
    setRecentLines((prev) => [line, ...prev.slice(0, 4)]);
  };

  // Request iOS 13+ permission & start listening to Phone / Tablet / Laptop IMU sensors
  const requestAndStartDeviceIMU = async () => {
    try {
      // iOS 13+ DeviceOrientationEvent permission
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof (DeviceOrientationEvent as any).requestPermission === 'function'
      ) {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission !== 'granted') {
          setDeviceSensorStatus('permission_denied');
          return;
        }
      }
      if (
        typeof DeviceMotionEvent !== 'undefined' &&
        typeof (DeviceMotionEvent as any).requestPermission === 'function'
      ) {
        try {
          await (DeviceMotionEvent as any).requestPermission();
        } catch {
          // Ignore if only orientation is granted
        }
      }
      onSourceChange('device_imu');
      setDeviceSensorStatus('listening_hardware');
    } catch {
      setDeviceSensorStatus('trackpad_fallback');
    }
  };

  // Attach DeviceOrientation + DeviceMotion listeners when in 'device_imu' mode
  useEffect(() => {
    if (currentSource !== 'device_imu') return;

    hardwareActiveRef.current = false;
    setDeviceSensorStatus('listening_hardware');

    const getScreenAngle = () => {
      if (typeof window !== 'undefined' && window.screen?.orientation?.angle !== undefined) {
        return window.screen.orientation.angle;
      }
      return typeof window !== 'undefined' && typeof (window as any).orientation === 'number'
        ? (window as any).orientation
        : 0;
    };

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      const rot = event.rotationRate;
      if (acc && (acc.x !== null || acc.y !== null || acc.z !== null)) {
        latestAccelRef.current = { x: acc.x, y: acc.y, z: acc.z };
        // If DeviceOrientation hasn't fired, derive pitch/roll directly from gravity vector
        if (!hardwareActiveRef.current && acc.x !== null && acc.y !== null && acc.z !== null) {
          const derived = accelerometerToAttitude(acc.x, acc.y, acc.z, trackpadPos.yaw);
          setHardwareEventsReceived((c) => c + 1);
          onReceiveRawData(derived);
        }
      }
      if (rot) {
        latestRotRateRef.current = { alpha: rot.alpha, beta: rot.beta, gamma: rot.gamma };
      }
    };

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta !== null || event.gamma !== null || event.alpha !== null) {
        hardwareActiveRef.current = true;
        setDeviceSensorStatus('listening_hardware');
        setHardwareEventsReceived((c) => c + 1);
        const imu = deviceOrientationToIMU(
          event.alpha,
          event.beta,
          event.gamma,
          getScreenAngle(),
          latestAccelRef.current,
          latestRotRateRef.current
        );
        onReceiveRawData(imu);
      }
    };

    window.addEventListener('devicemotion', handleMotion, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    window.addEventListener('deviceorientationabsolute' as any, handleOrientation, true);

    // Check after 900ms if desktop/laptop lacks hardware IMU events -> enable trackpad fallback notice
    const fallbackTimer = setTimeout(() => {
      if (!hardwareActiveRef.current) {
        setDeviceSensorStatus('trackpad_fallback');
      }
    }, 900);

    return () => {
      clearTimeout(fallbackTimer);
      window.removeEventListener('devicemotion', handleMotion, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
      window.removeEventListener('deviceorientationabsolute' as any, handleOrientation, true);
    };
  }, [currentSource, onReceiveRawData, trackpadPos.yaw]);

  // Keyboard & Trackpad Tilt handler for Laptops when in 'device_imu' mode
  useEffect(() => {
    if (currentSource !== 'device_imu') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      let changed = false;
      setTrackpadPos((prev) => {
        let { pitch, roll, yaw } = prev;
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          pitch = Math.min(75, pitch + 3);
          changed = true;
        } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          pitch = Math.max(-75, pitch - 3);
          changed = true;
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          roll = Math.min(135, roll + 4);
          changed = true;
        } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          roll = Math.max(-135, roll - 4);
          changed = true;
        } else if (e.key === 'e' || e.key === 'E') {
          yaw = (yaw + 5) % 360;
          changed = true;
        } else if (e.key === 'q' || e.key === 'Q') {
          yaw = (yaw - 5 + 360) % 360;
          changed = true;
        }
        if (changed) {
          const imu = deviceOrientationToIMU(360 - yaw, pitch, roll, 0);
          onReceiveRawData(imu);
          return { pitch, roll, yaw };
        }
        return prev;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSource, onReceiveRawData]);

  // Handle interactive Laptop Trackpad / Touch Tilt Pad surface
  const handleTrackpadMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (currentSource !== 'device_imu' || !trackpadTiltEnabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1; // [-1, 1]
    const normY = ((e.clientY - rect.top) / rect.height) * 2 - 1; // [-1, 1]

    const roll = Math.round(Math.max(-75, Math.min(75, normX * 65)) * 10) / 10;
    const pitch = Math.round(Math.max(-60, Math.min(60, -normY * 50)) * 10) / 10;
    const yaw = trackpadPos.yaw;

    setTrackpadPos({ pitch, roll, yaw });
    const imu = deviceOrientationToIMU(360 - yaw, pitch, roll, 0);
    onReceiveRawData(imu);
  };

  // Simulation Loop
  useEffect(() => {
    if (currentSource !== 'simulation') return;

    if (manualMode) {
      onReceiveRawData({
        pitch: manualPitch,
        roll: manualRoll,
        yaw: manualYaw,
        timestamp: Date.now(),
      });
      return;
    }

    if (!isSimulating) return;

    const startTime = performance.now();
    const interval = setInterval(() => {
      const elapsedSec = (performance.now() - startTime) / 1000;
      const att = generateSimulatedAttitude(simManeuver, elapsedSec);
      onReceiveRawData(att);
    }, 25);

    return () => clearInterval(interval);
  }, [
    currentSource,
    isSimulating,
    simManeuver,
    manualMode,
    manualPitch,
    manualRoll,
    manualYaw,
    onReceiveRawData,
  ]);

  // WebSerial Connection Logic
  const hasWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

  const connectSerial = async () => {
    setSerialError(null);
    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: serialBaud });
      serialPortRef.current = port;
      setSerialConnected(true);
      onSourceChange('webserial');

      const textDecoder = new (window as any).TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      serialReaderRef.current = reader;

      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              appendLog(trimmed);
              const parsed = parseIMUString(trimmed);
              if (parsed) {
                onReceiveRawData(parsed, trimmed);
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        setSerialError(err.message || 'Failed to connect to Serial Port');
      }
      setSerialConnected(false);
    }
  };

  const disconnectSerial = async () => {
    try {
      if (serialReaderRef.current) {
        await serialReaderRef.current.cancel();
        serialReaderRef.current = null;
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close();
        serialPortRef.current = null;
      }
    } catch (err) {
      console.warn('Error closing serial:', err);
    }
    setSerialConnected(false);
  };

  // WebSocket Connection Logic
  const connectWebSocket = () => {
    setWsError(null);
    setWsConnecting(true);
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        setWsConnecting(false);
        onSourceChange('websocket');
      };

      ws.onmessage = (event) => {
        const rawText = String(event.data);
        appendLog(rawText);
        const parsed = parseIMUString(rawText);
        if (parsed) {
          onReceiveRawData(parsed, rawText);
        }
      };

      ws.onerror = () => {
        setWsError('WebSocket connection error. Is the local Python server running?');
        setWsConnected(false);
        setWsConnecting(false);
      };

      ws.onclose = () => {
        setWsConnected(false);
        setWsConnecting(false);
      };
    } catch (err: any) {
      setWsError(err.message || 'WebSocket connection error');
      setWsConnecting(false);
    }
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsConnected(false);
    setWsConnecting(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Source Selector Segmented Buttons */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <button
          type="button"
          onClick={requestAndStartDeviceIMU}
          className={`flex items-center gap-1.5 flex-1 justify-center px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            currentSource === 'device_imu'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>Local Device IMU (Phone / Tab / Laptop)</span>
        </button>

        <button
          type="button"
          onClick={() => onSourceChange('simulation')}
          className={`flex items-center gap-1.5 flex-1 justify-center px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            currentSource === 'simulation'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Play className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span>Auto Flight Sim</span>
        </button>

        <button
          type="button"
          onClick={() => onSourceChange('webserial')}
          className={`flex items-center gap-1.5 flex-1 justify-center px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            currentSource === 'webserial'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Cable className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>WebSerial (ESP32)</span>
        </button>

        <button
          type="button"
          onClick={() => onSourceChange('websocket')}
          className={`flex items-center gap-1.5 flex-1 justify-center px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            currentSource === 'websocket'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Wifi className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>WebSocket (Python)</span>
        </button>
      </div>

      {/* Mode 1: Local Device IMU (Phone / Tablet / Laptop) */}
      {currentSource === 'device_imu' && (
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700/80 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Left Column: Device Sensor Status & Permission */}
          <div className="md:col-span-7 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>On-Device Accelerometer & Gyroscope Stream</span>
              </span>
              <button
                type="button"
                onClick={requestAndStartDeviceIMU}
                className="px-2.5 py-1 text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-md shadow-xs transition-colors cursor-pointer"
              >
                Request iOS / Mobile Permission
              </button>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              {hardwareEventsReceived > 0 ? (
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  Hardware IMU Active ({hardwareEventsReceived} packets) — Tilt your phone, tablet, or convertible laptop in 3D space to control the aircraft!
                </span>
              ) : (
                <span>
                  Listening to <code className="font-mono bg-slate-200/70 dark:bg-slate-700 px-1 rounded">DeviceOrientation</code> &{' '}
                  <code className="font-mono bg-slate-200/70 dark:bg-slate-700 px-1 rounded">DeviceMotion</code> sensors. On a MacBook or desktop without a hardware gyro, glide across the <strong>Laptop Trackpad Tilt Pad</strong> on the right or press <strong>WASD / Arrow Keys</strong>.
                </span>
              )}
            </p>

            {/* Yaw Heading Slider + Center Level button */}
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                Heading (Yaw): {trackpadPos.yaw}°
              </span>
              <input
                type="range"
                min="0"
                max="359"
                value={trackpadPos.yaw}
                onChange={(e) => {
                  const yaw = parseInt(e.target.value, 10);
                  setTrackpadPos((p) => ({ ...p, yaw }));
                  onReceiveRawData(
                    deviceOrientationToIMU(360 - yaw, trackpadPos.pitch, trackpadPos.roll, 0)
                  );
                }}
                className="flex-1 accent-emerald-600 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  setTrackpadPos({ pitch: 0, roll: 0, yaw: 0 });
                  onReceiveRawData(deviceOrientationToIMU(0, 0, 0, 0));
                }}
                className="px-2.5 py-1 text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
              >
                Level (0°)
              </button>
            </div>
          </div>

          {/* Right Column: Interactive Laptop Trackpad / Touch 2D Tilt Gimbal Pad */}
          <div className="md:col-span-5 flex flex-col gap-1">
            <div
              onPointerMove={handleTrackpadMove}
              onPointerDown={handleTrackpadMove}
              data-testid="laptop-trackpad-sensor"
              className="relative h-24 w-full rounded-lg bg-slate-900 border border-slate-700 overflow-hidden cursor-crosshair select-none flex items-center justify-center shadow-inner"
            >
              {/* Crosshair axes */}
              <div className="absolute inset-x-0 top-1/2 h-[1px] bg-slate-700/80 pointer-events-none" />
              <div className="absolute inset-y-0 left-1/2 w-[1px] bg-slate-700/80 pointer-events-none" />

              {/* Active Tilt Pip */}
              <div
                className="w-4 h-4 rounded-full bg-amber-400 border-2 border-white shadow-md pointer-events-none transition-transform duration-75"
                style={{
                  transform: `translate(${(trackpadPos.roll / 65) * 70}px, ${
                    (-trackpadPos.pitch / 50) * 36
                  }px)`,
                }}
              />

              <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[10px] font-mono text-slate-400 pointer-events-none">
                <span className="flex items-center gap-1">
                  <MousePointer className="w-3 h-3 text-amber-400" />
                  Laptop Trackpad / Touch IMU
                </span>
                <span className="text-amber-300 font-semibold">
                  P:{trackpadPos.pitch.toFixed(0)}° R:{trackpadPos.roll.toFixed(0)}°
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: Auto Flight Simulation */}
      {currentSource === 'simulation' && (
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700/80 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Flight Mode:</span>
              <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-700 p-0.5 rounded-md text-xs">
                <button
                  type="button"
                  onClick={() => setManualMode(false)}
                  className={`px-2.5 py-1 rounded cursor-pointer ${
                    !manualMode ? 'bg-white dark:bg-slate-800 font-semibold text-slate-800 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Aerodynamic Presets
                </button>
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className={`px-2.5 py-1 rounded cursor-pointer ${
                    manualMode ? 'bg-white dark:bg-slate-800 font-semibold text-slate-800 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Manual Sliders
                </button>
              </div>
            </div>

            {!manualMode && (
              <button
                type="button"
                onClick={() => setIsSimulating(!isSimulating)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  isSimulating
                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 hover:bg-amber-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {isSimulating ? 'Pause Motion' : 'Resume Motion'}
              </button>
            )}
          </div>

          {!manualMode ? (
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'climb_dive', label: 'Climb & Dive Oscillations' },
                { id: 'barrel_roll', label: 'Continuous Aileron Roll' },
                { id: 'turbulence', label: 'Turbulent Wind Gusts' },
                { id: 'figure8', label: 'Figure-8 Banking Turn' },
                { id: 'level', label: 'Cruising Steady Level' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSimManeuver(m.id as any);
                    setIsSimulating(true);
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${
                    simManeuver === m.id
                      ? 'bg-sky-50 dark:bg-sky-950/80 border-sky-300 dark:border-sky-600 text-sky-800 dark:text-sky-200 font-semibold'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="flex flex-col gap-1 bg-white dark:bg-slate-800 p-2.5 rounded border border-slate-200 dark:border-slate-700">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-red-600 dark:text-red-400">Pitch (Nose Up/Down)</span>
                  <span className="font-mono dark:text-slate-200">{manualPitch}°</span>
                </div>
                <input
                  type="range"
                  min="-80"
                  max="80"
                  value={manualPitch}
                  onChange={(e) => setManualPitch(parseInt(e.target.value, 10))}
                  className="w-full accent-red-600 cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1 bg-white dark:bg-slate-800 p-2.5 rounded border border-slate-200 dark:border-slate-700">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-sky-600 dark:text-sky-400">Roll (Bank Wings)</span>
                  <span className="font-mono dark:text-slate-200">{manualRoll}°</span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={manualRoll}
                  onChange={(e) => setManualRoll(parseInt(e.target.value, 10))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1 bg-white dark:bg-slate-800 p-2.5 rounded border border-slate-200 dark:border-slate-700">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Yaw (Compass Heading)</span>
                  <span className="font-mono dark:text-slate-200">{manualYaw}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="359"
                  value={manualYaw}
                  onChange={(e) => setManualYaw(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mode 3: WebSerial */}
      {currentSource === 'webserial' && (
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700/80 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Baud Rate:</label>
              <select
                value={serialBaud}
                onChange={(e) => setSerialBaud(parseInt(e.target.value, 10))}
                disabled={serialConnected}
                className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-800 dark:text-slate-100"
              >
                <option value={115200}>115200 (Standard ESP32)</option>
                <option value={9600}>9600</option>
                <option value={57600}>57600</option>
                <option value={230400}>230400</option>
                <option value={460800}>460800</option>
                <option value={921600}>921600 (Ultra High-Speed)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              {serialConnected ? (
                <button
                  type="button"
                  onClick={disconnectSerial}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 rounded-lg transition-colors cursor-pointer"
                >
                  Disconnect ESP32
                </button>
              ) : (
                <button
                  type="button"
                  onClick={connectSerial}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  <Cable className="w-3.5 h-3.5" />
                  <span>Connect ESP32 Serial Port</span>
                </button>
              )}
            </div>
          </div>

          {!hasWebSerial && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                WebSerial API is supported in Chrome, Edge, and Opera on macOS/Windows/Linux.
              </span>
            </div>
          )}

          {serialError && (
            <div className="flex items-center gap-2 p-2 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded text-xs text-rose-800 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{serialError}</span>
            </div>
          )}

          {serialConnected && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Connected to ESP32 over Serial Bus. Receiving real-time IMU packets.</span>
            </div>
          )}
        </div>
      )}

      {/* Mode 4: WebSocket */}
      {currentSource === 'websocket' && (
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700/80 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                Server URL:
              </label>
              <input
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                disabled={wsConnected || wsConnecting}
                placeholder="ws://localhost:8765"
                className="w-full text-xs font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center gap-2">
              {wsConnected ? (
                <button
                  type="button"
                  onClick={disconnectWebSocket}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 rounded-lg transition-colors cursor-pointer"
                >
                  Disconnect WebSocket
                </button>
              ) : (
                <button
                  type="button"
                  onClick={connectWebSocket}
                  disabled={wsConnecting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Wifi className="w-3.5 h-3.5" />
                  <span>{wsConnecting ? 'Connecting...' : 'Connect to Python Bridge'}</span>
                </button>
              )}
            </div>
          </div>

          {wsError && (
            <div className="flex items-center gap-2 p-2 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded text-xs text-rose-800 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{wsError}</span>
            </div>
          )}

          {wsConnected && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>WebSocket stream active. Connected to Python IMU bridge.</span>
            </div>
          )}
        </div>
      )}

      {/* Raw Incoming Line Console Monitor */}
      {recentLines.length > 0 && (
        <div className="bg-slate-900 text-slate-200 p-2.5 rounded-lg text-xs font-mono flex flex-col gap-1 shadow-inner">
          <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1">
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3 h-3 text-emerald-400" />
              <span>Raw Serial / Stream Monitor</span>
            </span>
            <button
              type="button"
              onClick={() => setRecentLines([])}
              className="text-[10px] text-slate-400 hover:text-white"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-col gap-0.5 pt-1 text-[11px]">
            {recentLines.map((ln, idx) => (
              <div key={idx} className="truncate text-slate-300">
                <span className="text-slate-500 mr-2">{idx === 0 ? '▶' : ' '}</span>
                {ln}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
