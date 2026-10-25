/**
 * Pure IMU + Analog Joystick telemetry math, calibration, parsing, and attitude transformation utilities.
 * Decoupled from UI rendering for unit testing and deterministic verification.
 */

export interface IMUData {
  pitch: number; // degrees, [-90, +90]
  roll: number;  // degrees, [-180, +180]
  yaw: number;   // degrees, [0, 360)
  ax?: number;   // m/s^2
  ay?: number;
  az?: number;
  gx?: number;   // deg/s
  gy?: number;
  gz?: number;
  joyX?: number; // normalized [-1.0, +1.0] (Left = -1, Right = +1)
  joyY?: number; // normalized [-1.0, +1.0] (Backward = -1, Forward = +1)
  joyBtn?: boolean; // Joystick push button (SW)
  timestamp: number;
}

export type AxisMapping = 'default' | 'swap_xy' | 'swap_yz' | 'swap_xz';

export interface CalibrationConfig {
  pitchOffset: number;
  rollOffset: number;
  yawOffset: number;
  invertPitch: boolean;
  invertRoll: boolean;
  invertYaw: boolean;
  axisMapping: AxisMapping;
  smoothingFactor: number; // 0 = raw, 0.9 = heavy filter
}

export const DEFAULT_CALIBRATION: CalibrationConfig = {
  pitchOffset: 0,
  rollOffset: 0,
  yawOffset: 0,
  invertPitch: false,
  invertRoll: false,
  invertYaw: false,
  axisMapping: 'default',
  smoothingFactor: 0.35,
};

/**
 * Normalizes an angle to [-180, 180] degrees.
 */
export function normalizeAngle180(angle: number): number {
  let a = angle % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a === 0 ? 0 : a;
}

/**
 * Normalizes heading to [0, 360) degrees.
 */
export function normalizeHeading360(heading: number): number {
  let h = heading % 360;
  if (h < 0) h += 360;
  return h === 0 ? 0 : h;
}

/**
 * Normalizes a joystick axis value into [-1.0, +1.0] with deadzone.
 * Automatically handles:
 * - Normalized floats in [-1.0, 1.0]
 * - Percentage values in [-100, 100]
 * - ESP32 12-bit ADC raw values in [0, 4095] (center ~1850..2048)
 * - Arduino 10-bit ADC raw values in [0, 1023] (center ~512)
 */
export function normalizeJoystickAxis(rawVal: number, deadzone: number = 0.10): number {
  if (!Number.isFinite(rawVal)) return 0;

  let norm = rawVal;
  let effectiveDeadzone = deadzone;
  if (rawVal > 1024 && rawVal <= 4096) {
    // ESP32 12-bit ADC (0..4095, center ~2048; wider 16% deadzone for ESP32 ADC non-linearity)
    norm = (rawVal - 2048) / 2048;
    effectiveDeadzone = Math.max(deadzone, 0.16);
  } else if (rawVal > 100 && rawVal <= 1024) {
    // 10-bit ADC (0..1023, center 512)
    norm = (rawVal - 512) / 512;
    effectiveDeadzone = Math.max(deadzone, 0.12);
  } else if (Math.abs(rawVal) > 1.5 && Math.abs(rawVal) <= 100) {
    // Percentage (-100..100)
    norm = rawVal / 100;
  }

  norm = Math.max(-1, Math.min(1, norm));
  if (Math.abs(norm) < effectiveDeadzone) return 0;
  return Math.round(norm * 100) / 100;
}

/**
 * Converts HTML5 DeviceOrientationEvent (alpha, beta, gamma) and optional DeviceMotion
 * acceleration/rotationRate from a Phone, Tablet, or Laptop into aeronautical IMUData.
 */
export function deviceOrientationToIMU(
  alpha: number | null,
  beta: number | null,
  gamma: number | null,
  screenOrientationAngle: number = 0,
  accel?: { x?: number | null; y?: number | null; z?: number | null },
  rotRate?: { alpha?: number | null; beta?: number | null; gamma?: number | null },
  joyX?: number,
  joyY?: number
): IMUData {
  const rawBeta = beta ?? 0;
  const rawGamma = gamma ?? 0;
  const rawAlpha = alpha ?? 0;

  let pitch = rawBeta;
  let roll = rawGamma;
  let yaw = rawAlpha !== 0 ? (360 - rawAlpha) % 360 : 0;

  // Compensate for landscape mode on phones/tablets
  if (screenOrientationAngle === 90) {
    pitch = -rawGamma;
    roll = rawBeta;
  } else if (screenOrientationAngle === -90 || screenOrientationAngle === 270) {
    pitch = rawGamma;
    roll = -rawBeta;
  }

  pitch = Math.max(-90, Math.min(90, normalizeAngle180(pitch)));
  roll = normalizeAngle180(roll);
  yaw = normalizeHeading360(yaw);

  const pRad = degreesToRadians(pitch);
  const rRad = degreesToRadians(roll);

  const ax = accel?.x != null ? accel.x : Math.sin(pRad) * 9.81;
  const ay = accel?.y != null ? accel.y : Math.sin(rRad) * 9.81;
  const az = accel?.z != null ? accel.z : Math.cos(pRad) * Math.cos(rRad) * 9.81;

  return {
    pitch: Math.round(pitch * 100) / 100,
    roll: Math.round(roll * 100) / 100,
    yaw: Math.round(yaw * 100) / 100,
    ax: Math.round(ax * 100) / 100,
    ay: Math.round(ay * 100) / 100,
    az: Math.round(az * 100) / 100,
    gx: rotRate?.beta ?? undefined,
    gy: rotRate?.gamma ?? undefined,
    gz: rotRate?.alpha ?? undefined,
    joyX: joyX !== undefined ? normalizeJoystickAxis(joyX) : undefined,
    joyY: joyY !== undefined ? normalizeJoystickAxis(joyY) : undefined,
    timestamp: Date.now(),
  };
}

/**
 * Converts raw 3-axis accelerometer readings (ax, ay, az in m/s^2) into pitch & roll angles.
 */
export function accelerometerToAttitude(ax: number, ay: number, az: number, prevYaw: number = 0): IMUData {
  const norm = Math.sqrt(ax * ax + ay * ay + az * az) || 9.81;
  const nx = ax / norm;
  const ny = ay / norm;
  const nz = az / norm;

  const pitch = (Math.atan2(-nx, Math.sqrt(ny * ny + nz * nz)) * 180) / Math.PI;
  const roll = (Math.atan2(ny, nz) * 180) / Math.PI;

  return {
    pitch: Math.round(normalizeAngle180(pitch) * 100) / 100,
    roll: Math.round(normalizeAngle180(roll) * 100) / 100,
    yaw: normalizeHeading360(prevYaw),
    ax: Math.round(ax * 100) / 100,
    ay: Math.round(ay * 100) / 100,
    az: Math.round(az * 100) / 100,
    timestamp: Date.now(),
  };
}

/**
 * Parses raw serial or websocket stream lines from ESP32 IMU + Joystick remote.
 * Supports:
 * 1. CSV:
 *    - 3 values: "pitch,roll,yaw"
 *    - 5 values: "pitch,roll,yaw,joyX,joyY"
 *    - 6 values: "pitch,roll,yaw,ax,ay,az"
 *    - 8 or 9 values: "pitch,roll,yaw,ax,ay,az,joyX,joyY[,joyBtn]"
 * 2. Key-Value: "P:10.5,R:-3.2,Y:180,JX:0.4,JY:0.8,BTN:1"
 * 3. JSON: '{"pitch": 10.5, "roll": -3.2, "yaw": 180, "joyX": 0.4, "joyY": 0.8, "joyBtn": 1}'
 */
export function parseIMUString(raw: string): IMUData | null {
  const line = raw.trim();
  if (!line || line.startsWith('//') || line.startsWith('#')) return null;

  // Case 1: JSON
  if (line.startsWith('{') && line.endsWith('}')) {
    try {
      const data = JSON.parse(line);
      const pitch = typeof data.pitch === 'number' ? data.pitch : (typeof data.p === 'number' ? data.p : 0);
      const roll = typeof data.roll === 'number' ? data.roll : (typeof data.r === 'number' ? data.r : 0);
      const yaw = typeof data.yaw === 'number' ? data.yaw : (typeof data.y === 'number' ? data.y : (typeof data.heading === 'number' ? data.heading : 0));
      const rawJx = typeof data.joyX === 'number' ? data.joyX : (typeof data.jx === 'number' ? data.jx : undefined);
      const rawJy = typeof data.joyY === 'number' ? data.joyY : (typeof data.jy === 'number' ? data.jy : undefined);
      const rawBtn = data.joyBtn ?? data.btn ?? data.sw;

      return {
        pitch: normalizeAngle180(pitch),
        roll: normalizeAngle180(roll),
        yaw: normalizeHeading360(yaw),
        ax: typeof data.ax === 'number' ? data.ax : undefined,
        ay: typeof data.ay === 'number' ? data.ay : undefined,
        az: typeof data.az === 'number' ? data.az : undefined,
        gx: typeof data.gx === 'number' ? data.gx : undefined,
        gy: typeof data.gy === 'number' ? data.gy : undefined,
        gz: typeof data.gz === 'number' ? data.gz : undefined,
        joyX: rawJx !== undefined ? normalizeJoystickAxis(rawJx) : undefined,
        joyY: rawJy !== undefined ? normalizeJoystickAxis(rawJy) : undefined,
        joyBtn: rawBtn !== undefined ? Boolean(rawBtn) : undefined,
        timestamp: Date.now(),
      };
    } catch {
      // Fall through to regex/CSV parsing
    }
  }

  // Case 2: Key-Value pairs like "P: 10.5, R: -3.2, Y: 180, JX: 0.5, JY: -0.2" or ST7735 "X 10.5 Y -3.2"
  const pitchMatch = line.match(/\b(?:pitch|pitch_deg|p|x)\s*[:=\s]\s*([+-]?\d+(?:\.\d+)?)/i);
  const rollMatch = line.match(/\b(?:roll|roll_deg|r|y)\s*[:=\s]\s*([+-]?\d+(?:\.\d+)?)/i);
  const yawMatch = line.match(/\b(?:yaw|yaw_deg|heading|hdg|z)\s*[:=\s]\s*([+-]?\d+(?:\.\d+)?)/i);
  const explicitYAsYaw = line.match(/\b(?:p|pitch)\s*[:=].*\by\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
  const jxMatch = line.match(/\b(?:joyx|jx|vx)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
  const jyMatch = line.match(/\b(?:joyy|jy|vy)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
  const btnMatch = line.match(/\b(?:joybtn|btn|sw)\s*[:=]\s*(\d+)/i);

  if (pitchMatch || rollMatch || yawMatch) {
    const hasExplicitPR = /\b(?:pitch|pitch_deg|p)\s*[:=]/i.test(line);
    const pitch = pitchMatch ? parseFloat(pitchMatch[1]) : 0;
    const roll = hasExplicitPR
      ? (line.match(/\b(?:roll|roll_deg|r)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i)
          ? parseFloat(line.match(/\b(?:roll|roll_deg|r)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i)![1])
          : 0)
      : (rollMatch ? parseFloat(rollMatch[1]) : 0);
    const yaw = explicitYAsYaw
      ? parseFloat(explicitYAsYaw[1])
      : (yawMatch ? parseFloat(yawMatch[1]) : 0);

    const axMatch = line.match(/ax\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
    const ayMatch = line.match(/ay\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
    const azMatch = line.match(/az\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);

    return {
      pitch: normalizeAngle180(pitch),
      roll: normalizeAngle180(roll),
      yaw: normalizeHeading360(yaw),
      ax: axMatch ? parseFloat(axMatch[1]) : undefined,
      ay: ayMatch ? parseFloat(ayMatch[1]) : undefined,
      az: azMatch ? parseFloat(azMatch[1]) : undefined,
      joyX: jxMatch ? normalizeJoystickAxis(parseFloat(jxMatch[1])) : undefined,
      joyY: jyMatch ? normalizeJoystickAxis(parseFloat(jyMatch[1])) : undefined,
      joyBtn: btnMatch ? parseInt(btnMatch[1], 10) > 0 : undefined,
      timestamp: Date.now(),
    };
  }

  // Case 3: Delimited numbers (comma, tab, semicolon, space)
  const tokens = line.split(/[,\s;\t]+/).map(t => t.trim()).filter(Boolean);
  if (tokens.length === 2) {
    const p = parseFloat(tokens[0]);
    const r = parseFloat(tokens[1]);
    if (!isNaN(p) && !isNaN(r)) {
      return {
        pitch: normalizeAngle180(p),
        roll: normalizeAngle180(r),
        yaw: 0,
        timestamp: Date.now(),
      };
    }
  }
  if (tokens.length >= 3) {
    const p = parseFloat(tokens[0]);
    const r = parseFloat(tokens[1]);
    const y = parseFloat(tokens[2]);

    if (!isNaN(p) && !isNaN(r) && !isNaN(y)) {
      // 5-token shorthand: pitch,roll,yaw,joyX,joyY
      if (tokens.length === 5) {
        const jx = parseFloat(tokens[3]);
        const jy = parseFloat(tokens[4]);
        return {
          pitch: normalizeAngle180(p),
          roll: normalizeAngle180(r),
          yaw: normalizeHeading360(y),
          joyX: !isNaN(jx) ? normalizeJoystickAxis(jx) : undefined,
          joyY: !isNaN(jy) ? normalizeJoystickAxis(jy) : undefined,
          timestamp: Date.now(),
        };
      }

      const ax = tokens.length > 3 ? parseFloat(tokens[3]) : undefined;
      const ay = tokens.length > 4 ? parseFloat(tokens[4]) : undefined;
      const az = tokens.length > 5 ? parseFloat(tokens[5]) : undefined;
      const jx = tokens.length > 6 ? parseFloat(tokens[6]) : undefined;
      const jy = tokens.length > 7 ? parseFloat(tokens[7]) : undefined;
      const btn = tokens.length > 8 ? parseFloat(tokens[8]) : undefined;

      return {
        pitch: normalizeAngle180(p),
        roll: normalizeAngle180(r),
        yaw: normalizeHeading360(y),
        ax: (ax !== undefined && !isNaN(ax)) ? ax : undefined,
        ay: (ay !== undefined && !isNaN(ay)) ? ay : undefined,
        az: (az !== undefined && !isNaN(az)) ? az : undefined,
        joyX: (jx !== undefined && !isNaN(jx)) ? normalizeJoystickAxis(jx) : undefined,
        joyY: (jy !== undefined && !isNaN(jy)) ? normalizeJoystickAxis(jy) : undefined,
        joyBtn: (btn !== undefined && !isNaN(btn)) ? btn > 0 : undefined,
        timestamp: Date.now(),
      };
    }
  }

  return null;
}

/**
 * Computes a new CalibrationConfig that zeroes (tares) the given raw IMU reading
 * so that the current physical sensor position becomes (pitch: 0°, roll: 0°, yaw: 0°).
 */
export function computeTareCalibration(
  raw: IMUData,
  config: CalibrationConfig = DEFAULT_CALIBRATION
): CalibrationConfig {
  let pitch = raw.pitch;
  let roll = raw.roll;
  let yaw = raw.yaw;

  if (config.axisMapping === 'swap_xy') {
    const tmp = pitch;
    pitch = roll;
    roll = tmp;
  } else if (config.axisMapping === 'swap_yz') {
    const tmp = roll;
    roll = yaw;
    yaw = tmp;
  } else if (config.axisMapping === 'swap_xz') {
    const tmp = pitch;
    pitch = yaw;
    yaw = tmp;
  }

  return {
    ...config,
    pitchOffset: Math.round(pitch * 100) / 100,
    rollOffset: Math.round(roll * 100) / 100,
    yawOffset: Math.round(yaw * 100) / 100,
  };
}

/**
 * Applies calibration offsets, axis swaps, inversions, and low-pass smoothing.
 */
export function applyCalibration(
  raw: IMUData,
  config: CalibrationConfig,
  previous?: IMUData
): IMUData {
  let pitch = raw.pitch;
  let roll = raw.roll;
  let yaw = raw.yaw;

  // 1. Axis Swapping
  if (config.axisMapping === 'swap_xy') {
    const tmp = pitch;
    pitch = roll;
    roll = tmp;
  } else if (config.axisMapping === 'swap_yz') {
    const tmp = roll;
    roll = yaw;
    yaw = tmp;
  } else if (config.axisMapping === 'swap_xz') {
    const tmp = pitch;
    pitch = yaw;
    yaw = tmp;
  }

  // 2. Offsets (Tare / Zero calibration)
  pitch = pitch - config.pitchOffset;
  roll = roll - config.rollOffset;
  yaw = yaw - config.yawOffset;

  // 3. Inversions
  if (config.invertPitch) pitch = -pitch;
  if (config.invertRoll) roll = -roll;
  if (config.invertYaw) yaw = -yaw;

  pitch = normalizeAngle180(pitch);
  roll = normalizeAngle180(roll);
  yaw = normalizeHeading360(yaw);

  // 4. Low-pass filter (exponential moving average) + micro-jitter deadband stabilization
  if (previous && config.smoothingFactor > 0 && config.smoothingFactor < 1) {
    const alpha = 1 - config.smoothingFactor;
    let yawDiff = yaw - previous.yaw;
    if (yawDiff > 180) yawDiff -= 360;
    if (yawDiff < -180) yawDiff += 360;

    const pitchDiff = pitch - previous.pitch;
    const rollDiff = roll - previous.roll;

    // Suppress sensor noise/jitter (up to ~0.8° when MPU6050 is mounted vertically)
    pitch = Math.abs(pitchDiff) < 0.35 ? previous.pitch : previous.pitch + alpha * pitchDiff;
    roll = Math.abs(rollDiff) < 0.35 ? previous.roll : previous.roll + alpha * rollDiff;
    yaw =
      Math.abs(yawDiff) < 0.45
        ? previous.yaw
        : normalizeHeading360(previous.yaw + alpha * yawDiff);

    // Snap sub-degree resting offset around calibrated 0° to exact 0.0°
    if (Math.abs(pitch) < 0.65) pitch = 0;
    if (Math.abs(roll) < 0.65) roll = 0;
  }

  return {
    ...raw,
    pitch: Math.round(pitch * 100) / 100,
    roll: Math.round(roll * 100) / 100,
    yaw: Math.round(yaw * 100) / 100,
  };
}

export function degreesToRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toAircraftEuler(pitchDeg: number, rollDeg: number, yawDeg: number) {
  return {
    pitchRad: degreesToRadians(pitchDeg),
    rollRad: degreesToRadians(rollDeg),
    yawRad: degreesToRadians(yawDeg),
  };
}

/**
 * Generates synthetic flight simulation telemetry (attitude + joystick remote thrust/steering) for testing.
 */
export function generateSimulatedAttitude(
  mode: 'level' | 'climb_dive' | 'barrel_roll' | 'turbulence' | 'figure8',
  elapsedSec: number
): IMUData {
  let pitch = 0;
  let roll = 0;
  let yaw = 0;
  let az = 1.0;

  switch (mode) {
    case 'climb_dive':
      pitch = Math.sin(elapsedSec * 0.8) * 16;
      roll = Math.sin(elapsedSec * 0.4) * 10;
      yaw = (elapsedSec * 6) % 360;
      az = 1.0 + Math.cos(elapsedSec * 0.8) * 0.35;
      break;

    case 'barrel_roll':
      pitch = Math.sin(elapsedSec * 0.5) * 8;
      roll = (elapsedSec * 90) % 360;
      if (roll > 180) roll -= 360;
      yaw = (elapsedSec * 12) % 360;
      az = 1.2 + Math.sin(elapsedSec * 2) * 0.3;
      break;

    case 'turbulence':
      pitch = Math.sin(elapsedSec * 2.1) * 8 + Math.cos(elapsedSec * 4.7) * 4;
      roll = Math.cos(elapsedSec * 2.7) * 14 + Math.sin(elapsedSec * 5.3) * 6;
      yaw = (elapsedSec * 8 + Math.sin(elapsedSec * 1.5) * 12) % 360;
      az = 1.0 + Math.sin(elapsedSec * 8) * 0.35;
      break;

    case 'figure8':
      roll = Math.sin(elapsedSec * 0.6) * 32;
      pitch = Math.abs(roll) * 0.14;
      yaw = (elapsedSec * 18 + Math.sin(elapsedSec * 0.6) * 55) % 360;
      az = 1.0 / Math.max(0.2, Math.cos(degreesToRadians(roll)));
      break;

    case 'level':
    default:
      pitch = 0;
      roll = 0;
      yaw = 0;
      az = 1.0;
      break;
  }

  return {
    pitch: normalizeAngle180(pitch),
    roll: normalizeAngle180(roll),
    yaw: normalizeHeading360(yaw),
    ax: Math.sin(degreesToRadians(pitch)) * 9.81,
    ay: Math.sin(degreesToRadians(roll)) * 9.81,
    az: az * 9.81,
    timestamp: Date.now(),
  };
}
