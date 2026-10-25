import React, { useRef, useState } from 'react';
import {
  Gamepad2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Zap,
  Mountain,
  Cloud,
  Navigation,
  ArrowLeftRight,
} from 'lucide-react';
import {
  mapHardwareJoystick,
  type FlightPositionState,
  type JoystickInput,
  type TerrainMode,
} from '../utils/flightPhysics';

interface JoystickRemoteHUDProps {
  remoteInput: JoystickInput;
  onChangeRemote: (next: JoystickInput) => void;
  flightState: FlightPositionState;
  totalRings: number;
  onResetFlight: () => void;
  terrainMode: TerrainMode;
  onChangeTerrainMode: (mode: TerrainMode) => void;
  espJoyX?: number;
  espJoyY?: number;
}

export const JoystickRemoteHUD: React.FC<JoystickRemoteHUDProps> = ({
  remoteInput,
  onChangeRemote,
  flightState,
  totalRings,
  onResetFlight,
  terrainMode,
  onChangeTerrainMode,
  espJoyX,
  espJoyY,
}) => {
  const padRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Apply VRx/VRy swap and polarity reversal to raw ESP32 hardware joystick inputs
  const mappedHw = mapHardwareJoystick(
    {
      pitch: 0,
      roll: 0,
      yaw: 0,
      joyX: espJoyX ?? 0,
      joyY: espJoyY ?? 0,
      timestamp: 0,
    },
    remoteInput
  );

  const activeJoyX =
    Math.abs(mappedHw.joyX) > Math.abs(remoteInput.joyX)
      ? mappedHw.joyX
      : remoteInput.joyX;
  const activeJoyY =
    Math.abs(mappedHw.joyY) > Math.abs(remoteInput.joyY)
      ? mappedHw.joyY
      : remoteInput.joyY;

  const swapVRxVRy = remoteInput.swapVRxVRy !== false;
  const reverseXY = remoteInput.reverseX !== false && remoteInput.reverseY !== false;
  const turnOnSideways = remoteInput.turnOnSideways === true;

  const updateStickFromPointer = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width / 2 - 12;

    let dx = (clientX - cx) / maxR;
    let dy = -(clientY - cy) / maxR; // Up is +Y (Forward), Down is -Y (Backward)

    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }

    onChangeRemote({
      ...remoteInput,
      joyX: Math.round(dx * 100) / 100,
      joyY: Math.round(dy * 100) / 100,
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore if synthetic pointer event
    }
    setDragging(true);
    updateStickFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateStickFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    setDragging(false);
    onChangeRemote({
      ...remoteInput,
      joyX: 0,
      joyY: 0,
    });
  };

  const pulseDirection = (jx: number, jy: number) => {
    onChangeRemote({
      ...remoteInput,
      autoCruise: jy < 0 ? false : remoteInput.autoCruise,
      joyX: jx,
      joyY: jy,
    });
  };

  return (
    <div
      data-testid="custom-remote-hud"
      className="flex flex-col gap-2 bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-md p-3 select-none w-[264px] transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 tracking-wider flex items-center gap-1.5">
          <Gamepad2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span>CUSTOM ESP32 REMOTE</span>
        </span>
        <button
          type="button"
          onClick={onResetFlight}
          title="Reset Aircraft to Runway (Key: R)"
          aria-label="Reset Aircraft to Runway"
          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
        >
          <RotateCcw className="w-2.5 h-2.5" />
          <span>Runway</span>
        </button>
      </div>

      {/* Live Flight Sim Telemetry Strip (Speed, Alt, Rings) */}
      <div className="grid grid-cols-3 gap-1 text-center font-mono">
        <div className="bg-slate-50 dark:bg-slate-800/80 p-1 rounded border border-slate-200/80 dark:border-slate-700">
          <div className="text-[9px] font-sans font-semibold text-slate-500 dark:text-slate-400">
            SPEED
          </div>
          <div
            data-testid="hud-airspeed"
            className="text-[11px] font-bold text-sky-600 dark:text-sky-400 tabular-nums"
          >
            {flightState.airspeedKts} KT
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/80 p-1 rounded border border-slate-200/80 dark:border-slate-700">
          <div className="text-[9px] font-sans font-semibold text-slate-500 dark:text-slate-400">
            ALTITUDE
          </div>
          <div
            data-testid="hud-altitude"
            className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums"
          >
            {flightState.altitudeFt} FT
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/80 p-1 rounded border border-slate-200/80 dark:border-slate-700">
          <div className="text-[9px] font-sans font-semibold text-slate-500 dark:text-slate-400">
            RINGS
          </div>
          <div
            data-testid="hud-rings"
            className="text-[11px] font-bold text-amber-600 dark:text-amber-400 tabular-nums"
          >
            {flightState.ringsCollected}/{totalRings}
          </div>
        </div>
      </div>

      {/* Dual Control Layout: 2D Analog Thumbstick + Directional D-Pad Buttons */}
      <div className="grid grid-cols-2 gap-2 items-center pt-0.5">
        {/* Interactive 2-Axis Joystick Gimbal */}
        <div className="flex flex-col items-center gap-1">
          <div
            ref={padRef}
            data-testid="virtual-joystick-pad"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative w-24 h-24 rounded-full bg-slate-900 border-2 border-slate-700 shadow-inner flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
          >
            {/* Concentric Gimbal Rings & Crosshair */}
            <div className="absolute inset-3 rounded-full border border-slate-700/70 pointer-events-none" />
            <div className="absolute inset-x-2 top-1/2 h-[1px] bg-slate-700/80 pointer-events-none" />
            <div className="absolute inset-y-2 left-1/2 w-[1px] bg-slate-700/80 pointer-events-none" />

            {/* Cardinal Labels */}
            <span className="absolute top-1 text-[8px] font-mono text-slate-400 pointer-events-none">
              FWD
            </span>
            <span className="absolute bottom-1 text-[8px] font-mono text-slate-400 pointer-events-none">
              REV
            </span>
            <span className="absolute left-1.5 text-[8px] font-mono text-slate-400 pointer-events-none">
              L
            </span>
            <span className="absolute right-1.5 text-[8px] font-mono text-slate-400 pointer-events-none">
              R
            </span>

            {/* Thumbstick Cap */}
            <div
              className="w-7 h-7 rounded-full bg-sky-500 border-2 border-white shadow-md pointer-events-none flex items-center justify-center"
              style={{
                transform: `translate(${activeJoyX * 28}px, ${-activeJoyY * 28}px)`,
              }}
            >
              <div className="w-2 h-2 rounded-full bg-white/80" />
            </div>
          </div>
          <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
            X:{activeJoyX >= 0 ? `+${activeJoyX.toFixed(1)}` : activeJoyX.toFixed(1)}{' '}
            Y:{activeJoyY >= 0 ? `+${activeJoyY.toFixed(1)}` : activeJoyY.toFixed(1)}
          </span>
        </div>

        {/* Tactile Flight Direction D-Pad (Forward / Backward / Sideways Left / Sideways Right) */}
        <div className="flex flex-col items-center gap-1">
          <div className="grid grid-cols-3 gap-1 w-24 h-24 items-center justify-items-center">
            <div />
            <button
              type="button"
              aria-label="Move Plane Forward"
              onClick={() => pulseDirection(0, 1.0)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                activeJoyY > 0.2
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-700'
              }`}
              title="Move Forward (W / Up Arrow)"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <div />

            <button
              type="button"
              aria-label="Move Plane Left"
              onClick={() => pulseDirection(-0.85, activeJoyY)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                activeJoyX < -0.2
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-700'
              }`}
              title="Move Sideways Left (A / Left Arrow)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              aria-label="Stop / Hover Plane"
              onClick={() =>
                onChangeRemote({
                  ...remoteInput,
                  autoCruise: false,
                  joyX: 0,
                  joyY: 0,
                })
              }
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-200 dark:bg-slate-700 text-[9px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 cursor-pointer"
              title="Stop / Hold Position"
            >
              STOP
            </button>

            <button
              type="button"
              aria-label="Move Plane Right"
              onClick={() => pulseDirection(0.85, activeJoyY)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                activeJoyX > 0.2
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-700'
              }`}
              title="Move Sideways Right (D / Right Arrow)"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <div />
            <button
              type="button"
              aria-label="Move Plane Backward"
              onClick={() => pulseDirection(0, -0.85)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                activeJoyY < -0.2
                  ? 'bg-amber-600 border-amber-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-slate-700'
              }`}
              title="Move Backward / Reverse (S / Down Arrow)"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <div />
          </div>
          <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400">
            WASD / Arrows
          </span>
        </div>
      </div>

      {/* ESP32 Joystick VRx/VRy Mapping & Sideways Glide Mode */}
      <div className="flex flex-col gap-1 pt-1.5 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between text-[9px] font-semibold text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <ArrowLeftRight className="w-2.5 h-2.5 text-sky-500" />
            <span>ESP32 JOYSTICK AXIS MAP</span>
          </span>
          <span className="font-mono tabular-nums" data-testid="hud-coordinates">
            X:{flightState.x.toFixed(0)}m Z:{flightState.z.toFixed(0)}m
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() =>
              onChangeRemote({
                ...remoteInput,
                swapVRxVRy: !swapVRxVRy,
              })
            }
            title="Swap VRx and VRy analog pins from ESP32 joystick"
            className={`py-1 px-1 rounded text-[9px] font-semibold border transition-colors cursor-pointer truncate ${
              swapVRxVRy
                ? 'bg-sky-600/90 border-sky-500 text-white'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            VRx↔VRy: {swapVRxVRy ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeRemote({
                ...remoteInput,
                reverseX: !reverseXY,
                reverseY: !reverseXY,
              })
            }
            title="Reverse VRx and VRy joystick polarity"
            className={`py-1 px-1 rounded text-[9px] font-semibold border transition-colors cursor-pointer truncate ${
              reverseXY
                ? 'bg-sky-600/90 border-sky-500 text-white'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            Rev XY: {reverseXY ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeRemote({
                ...remoteInput,
                turnOnSideways: !turnOnSideways,
              })
            }
            title="Choose whether sideways joystick glides sideways (Strafe) or turns heading"
            className={`py-1 px-1 rounded text-[9px] font-semibold border transition-colors cursor-pointer truncate ${
              !turnOnSideways
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-amber-600 border-amber-500 text-white'
            }`}
          >
            {!turnOnSideways ? 'Side: Glide' : 'Side: Turn'}
          </button>
        </div>
      </div>

      {/* Cruise Auto-Throttle & 3-Mode Terrain Switcher (Mountains / Clouds Only / Off) */}
      <div className="flex flex-col gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[11px]">
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() =>
              onChangeRemote({
                ...remoteInput,
                autoCruise: !remoteInput.autoCruise,
              })
            }
            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-md font-semibold text-[10px] transition-colors cursor-pointer whitespace-nowrap ${
              remoteInput.autoCruise
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Navigation className="w-3 h-3" />
            <span>{remoteInput.autoCruise ? 'Cruise: ON' : 'Manual Stick'}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeRemote({
                ...remoteInput,
                boost: !remoteInput.boost,
              })
            }
            className={`flex items-center justify-center gap-1 py-1 px-2 rounded-md font-semibold text-[10px] transition-colors cursor-pointer whitespace-nowrap ${
              remoteInput.boost
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
            title="Toggle Afterburner Speed Boost"
          >
            <Zap className="w-3 h-3" />
            <span>Boost</span>
          </button>
        </div>

        {/* 3-Mode World Terrain Selector: Mountains & Trees | Clouds Only | Off */}
        <div className="grid grid-cols-3 gap-1 pt-0.5">
          <button
            type="button"
            data-testid="terrain-mode-mountains"
            onClick={() => onChangeTerrainMode('mountains')}
            className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded text-[10px] font-semibold cursor-pointer transition-colors ${
              terrainMode === 'mountains'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Mountain className="w-3 h-3 shrink-0" />
            <span>Mountains</span>
          </button>

          <button
            type="button"
            data-testid="terrain-mode-clouds"
            onClick={() => onChangeTerrainMode('clouds_only')}
            className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded text-[10px] font-semibold cursor-pointer transition-colors ${
              terrainMode === 'clouds_only'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Cloud className="w-3 h-3 shrink-0" />
            <span>Clouds Only</span>
          </button>

          <button
            type="button"
            data-testid="terrain-mode-off"
            onClick={() => onChangeTerrainMode('off')}
            className={`flex items-center justify-center py-1 px-1.5 rounded text-[10px] font-semibold cursor-pointer transition-colors ${
              terrainMode === 'off'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>No Terrain</span>
          </button>
        </div>
      </div>
    </div>
  );
};
