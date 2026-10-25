/**
 * Pure 3D Flight Simulator Physics, Custom Remote Joystick Kinematics, and Procedural Terrain Heightmap Math.
 * Decoupled from Three.js / React DOM for fast unit testing.
 */

import { degreesToRadians, normalizeHeading360, type IMUData } from './imuMath';

export type TerrainMode = 'mountains' | 'clouds_only' | 'off';

export interface JoystickInput {
  joyX: number; // [-1, 1] Left (-1) / Right (+1) sideways movement
  joyY: number; // [-1, 1] Backward (-1) / Forward (+1) thrust & speed
  boost?: boolean;
  cruiseThrottle: number; // [0, 1] baseline cruise thrust when autoCruise is active
  autoCruise: boolean;
  swapVRxVRy?: boolean; // Swap hardware ESP32 VRx and VRy channels (default: true)
  reverseX?: boolean;   // Reverse hardware joystick X direction (default: true)
  reverseY?: boolean;   // Reverse hardware joystick Y direction (default: true)
  turnOnSideways?: boolean; // If false (default), moving joystick sideways moves aircraft sideways instead of turning
}

/**
 * Maps incoming ESP32 hardware joystick axes (VRx, VRy) with configurable VRx/VRy swap and axis reversal.
 * Always returns numeric joyX and joyY (0 when disconnected) so callers never encounter undefined/NaN.
 */
export function mapHardwareJoystick(
  imu: IMUData,
  remote: Pick<JoystickInput, 'swapVRxVRy' | 'reverseX' | 'reverseY'>
): { joyX: number; joyY: number; hwJoyX?: number; hwJoyY?: number } {
  if (imu.joyX === undefined && imu.joyY === undefined) {
    return { joyX: 0, joyY: 0, hwJoyX: undefined, hwJoyY: undefined };
  }
  const rawX = Number.isFinite(imu.joyX) ? (imu.joyX as number) : 0;
  const rawY = Number.isFinite(imu.joyY) ? (imu.joyY as number) : 0;
  const swap = remote.swapVRxVRy ?? false;
  const revX = remote.reverseX ?? false;
  const revY = remote.reverseY ?? false;

  let mappedX = swap ? rawY : rawX;
  let mappedY = swap ? rawX : rawY;

  if (revX && mappedX !== 0) mappedX = -mappedX;
  if (revY && mappedY !== 0) mappedY = -mappedY;

  return {
    joyX: mappedX,
    joyY: mappedY,
    hwJoyX: mappedX,
    hwJoyY: mappedY,
  };
}

export interface FlightPositionState {
  x: number;           // World X (meters, East/West)
  y: number;           // World Y altitude (meters)
  z: number;           // World Z (meters, North = -Z, South = +Z)
  vx: number;          // Velocity X (m/s)
  vy: number;          // Velocity Y (m/s)
  vz: number;          // Velocity Z (m/s)
  forwardSpeed: number; // Signed forward speed along heading (m/s, positive = forward, negative = backward)
  lateralSpeed: number; // Signed right/left strafe speed (m/s, positive = right, negative = left)
  airspeedKts: number;  // Indicated airspeed in knots
  altitudeFt: number;   // Altitude in feet
  groundAltitudeFt: number; // Ground elevation below aircraft in feet
  headingDeg: number;   // Dynamic heading combining IMU yaw + optional steering [0, 360)
  yawAccumulator: number; // Accumulated yaw offset
  ringsCollected: number;
  distanceTraveled: number;
}

export interface WaypointRing {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  collected: boolean;
}

export const WORLD_BOUNDS = 220; // Wraps smoothly at ±220m

export const INITIAL_FLIGHT_STATE: FlightPositionState = {
  x: 0,
  y: 8.5,
  z: 20,
  vx: 0,
  vy: 0,
  vz: 0,
  forwardSpeed: 0,
  lateralSpeed: 0,
  airspeedKts: 0,
  altitudeFt: 280,
  groundAltitudeFt: 0,
  headingDeg: 0,
  yawAccumulator: 0,
  ringsCollected: 0,
  distanceTraveled: 0,
};

/**
 * Deterministic procedural terrain elevation function getTerrainHeight(x, z).
 * Features:
 * - Flat runway & river valley corridor near |x| < 16 so the airport runway at x=0, z=[-35..35] is level at y = -2.0.
 * - Rolling foothills and towering alpine mountain ranges on both flanks and distant horizons.
 */
export function getTerrainHeight(x: number, z: number): number {
  const baseValleyY = -2.0;

  // Keep central runway valley flat around x = 0, z in [-48, 48]
  const distFromCenterRunwayX = Math.abs(x);
  const distFromCenterRunwayZ = Math.max(0, Math.abs(z) - 42);
  const valleyMask = Math.min(
    1,
    Math.max(0, (distFromCenterRunwayX - 14) / 18) + Math.max(0, distFromCenterRunwayZ / 35) * 0.5
  );

  if (valleyMask <= 0.001) {
    return baseValleyY;
  }

  // Base mountain flank rise as you move away from the central valley
  const flankRise = Math.min(12.0, Math.max(0, (distFromCenterRunwayX - 18) * 0.16));

  // Multi-octave trigonometric mountain synthesis (non-negative peaks + scenic valleys)
  const h1 = (Math.sin(x * 0.045) * Math.cos(z * 0.042) + 0.65) * 7.5;
  const h2 = Math.sin(x * 0.095 + 1.4) * Math.sin(z * 0.088 + 0.7) * 4.2;
  const h3 = Math.cos((x + z) * 0.15) * 2.0;
  const ridge = Math.abs(Math.sin(x * 0.032 - z * 0.025)) * 7.5;

  const rawElevation = Math.max(-0.4, flankRise + h1 + h2 + h3 + ridge - 2.0);
  return baseValleyY + rawElevation * valleyMask;
}

/**
 * Generates scenic waypoint rings along the valley and mountain passes.
 */
export function createInitialWaypoints(): WaypointRing[] {
  const coords: Array<[number, number, number]> = [
    [0, 7.5, -22],
    [-12, 10.5, -62],
    [-28, 13.0, -105],
    [8, 14.5, -145],
    [36, 12.0, -95],
    [25, 9.5, -40],
    [-18, 11.0, 55],
    [22, 12.5, 95],
  ];

  return coords.map(([x, y, z], idx) => {
    const groundY = getTerrainHeight(x, z);
    return {
      id: idx + 1,
      x,
      y: Math.max(y, groundY + 6.5),
      z,
      radius: 4.2,
      collected: false,
    };
  });
}

/**
 * Advances aircraft 3D world position and velocities by dt seconds based on:
 * - IMU orientation (pitch, roll, yaw)
 * - Joystick / Custom Remote input (joyX = left/right sideways movement, joyY = forward/backward thrust)
 *
 * Ensures:
 * - Pushing Joystick Forward (joyY > 0) moves the plane forward along its heading.
 * - Pulling Joystick Backward (joyY < 0) moves the plane backward (reverse thrust / backing up).
 * - Moving Joystick Sideways (joyX < 0 or joyX > 0) moves the plane purely sideways Left/Right (without spinning yaw left),
 *   unless turnOnSideways is explicitly enabled.
 */
export function stepFlightPhysics(
  prevState: FlightPositionState,
  imu: IMUData,
  remote: JoystickInput,
  dt: number,
  waypoints?: WaypointRing[],
  terrainMode: TerrainMode = 'mountains'
): FlightPositionState {
  const clampedDt = Math.min(Math.max(dt, 0.001), 0.1);

  const { hwJoyX, hwJoyY } = mapHardwareJoystick(imu, remote);

  // Combine mapped hardware IMU joystick telemetry (if present) with UI/Keyboard remote joystick
  const effectiveJoyX =
    hwJoyX !== undefined && Math.abs(hwJoyX) > Math.abs(remote.joyX)
      ? hwJoyX
      : remote.joyX;

  const effectiveJoyY =
    hwJoyY !== undefined && Math.abs(hwJoyY) > Math.abs(remote.joyY)
      ? hwJoyY
      : remote.joyY;

  const boostMultiplier = remote.boost || imu.joyBtn ? 1.65 : 1.0;

  // Target forward/backward velocity (m/s):
  // In 'clouds_only' mode, autoCruise means the aircraft stays in cruise at one fixed point while clouds stream past it;
  // only explicit joystick Y input (effectiveJoyY) translates the aircraft position forward/backward!
  let targetForwardCmd = effectiveJoyY;
  if (terrainMode !== 'clouds_only' && remote.autoCruise && effectiveJoyY >= -0.05) {
    targetForwardCmd = Math.max(remote.cruiseThrottle, effectiveJoyY);
  }

  const maxForwardSpeed = 28.0 * boostMultiplier; // m/s
  const targetForwardSpeed = targetForwardCmd * maxForwardSpeed;

  // Target left/right sideways velocity (m/s) directly from Joystick X input
  const maxLateralSpeed = 22.0 * boostMultiplier;
  const targetLateralSpeed = Math.max(-1, Math.min(1, effectiveJoyX)) * maxLateralSpeed;

  // Smooth exponential damping for responsive flight feel
  const responseRate = 1 - Math.exp(-6.5 * clampedDt);
  let forwardSpeed =
    prevState.forwardSpeed + (targetForwardSpeed - prevState.forwardSpeed) * responseRate;
  let lateralSpeed =
    prevState.lateralSpeed + (targetLateralSpeed - prevState.lateralSpeed) * responseRate;

  // Snap tiny residual speeds to zero so the aircraft and camera come to a complete, rock-solid stop
  if (Math.abs(targetForwardSpeed) < 0.01 && Math.abs(forwardSpeed) < 0.04) {
    forwardSpeed = 0;
  }
  if (Math.abs(targetLateralSpeed) < 0.01 && Math.abs(lateralSpeed) < 0.04) {
    lateralSpeed = 0;
  }

  // By default (turnOnSideways = false), sideways joystick moves the aircraft sideways instead of turning left/right
  const turnRateDegPerSec =
    remote.turnOnSideways && Math.abs(effectiveJoyX) > 0.01
      ? effectiveJoyX * 48 * boostMultiplier
      : 0;
  const newYawAccumulator = normalizeHeading360(
    prevState.yawAccumulator + turnRateDegPerSec * clampedDt
  );
  // In 'clouds_only' cruise-at-one-point mode, keep heading aligned with the incoming cloud stream unless turning is enabled
  const headingDeg =
    terrainMode === 'clouds_only' && !remote.turnOnSideways
      ? 0
      : normalizeHeading360(imu.yaw + newYawAccumulator);
  const headingRad = degreesToRadians(headingDeg);

  // In Three.js aeronautical coordinates (matching euler.set(pRad, -yRad, -rRad, 'YXZ')):
  // Heading 0° (North) points along -Z: forward = (+sin(hdg), 0, -cos(hdg))
  // Right wing (East at 0° hdg) points along +X: right = (+cos(hdg), 0, +sin(hdg))
  const fwdX = Math.sin(headingRad);
  const fwdZ = -Math.cos(headingRad);
  const rightX = Math.cos(headingRad);
  const rightZ = Math.sin(headingRad);

  const vx = fwdX * forwardSpeed + rightX * lateralSpeed;
  const vz = fwdZ * forwardSpeed + rightZ * lateralSpeed;

  // Vertical climb/descent rate from Pitch angle ONLY when the aircraft is actually translating across terrain
  const pitchDeadbanded = Math.abs(imu.pitch) > 2.5 ? imu.pitch : 0;
  const pitchRad = degreesToRadians(Math.max(-65, Math.min(65, pitchDeadbanded)));
  const activeSpeedMag = Math.abs(forwardSpeed) + Math.abs(lateralSpeed) * 0.35;
  const vy =
    terrainMode === 'clouds_only'
      ? 0
      : activeSpeedMag > 0.2
      ? Math.sin(pitchRad) * activeSpeedMag * 0.65
      : 0;

  let nextX = prevState.x + vx * clampedDt;
  let nextZ = prevState.z + vz * clampedDt;
  let nextY = prevState.y + vy * clampedDt;

  // Wrap around world bounds [-WORLD_BOUNDS, +WORLD_BOUNDS] seamlessly
  if (nextX > WORLD_BOUNDS) nextX -= WORLD_BOUNDS * 2;
  if (nextX < -WORLD_BOUNDS) nextX += WORLD_BOUNDS * 2;
  if (nextZ > WORLD_BOUNDS) nextZ -= WORLD_BOUNDS * 2;
  if (nextZ < -WORLD_BOUNDS) nextZ += WORLD_BOUNDS * 2;

  // Terrain collision floor & ceiling clamp
  const groundY = terrainMode === 'mountains' ? getTerrainHeight(nextX, nextZ) : -28.0;
  const minClearanceY = terrainMode === 'mountains' ? groundY + 1.8 : -24.0;
  const maxCeilingY = 62.0;
  nextY = Math.max(minClearanceY, Math.min(maxCeilingY, nextY));

  // Waypoint ring collection check (active in mountains mode)
  let ringsCollected = prevState.ringsCollected;
  if (waypoints && terrainMode === 'mountains') {
    for (const ring of waypoints) {
      if (!ring.collected) {
        const dx = nextX - ring.x;
        const dy = nextY - ring.y;
        const dz = nextZ - ring.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq <= (ring.radius + 2.2) * (ring.radius + 2.2)) {
          ring.collected = true;
          ringsCollected += 1;
        }
      }
    }
  }

  const totalSpeedMs = Math.sqrt(vx * vx + vy * vy + vz * vz);
  // In clouds_only mode, display simulated cruise airspeed (~118 KT) even while aircraft holds one point
  const cruiseAirspeedMs =
    terrainMode === 'clouds_only' && remote.autoCruise
      ? Math.max(totalSpeedMs, remote.cruiseThrottle * maxForwardSpeed)
      : totalSpeedMs;
  const airspeedKts = Math.round(cruiseAirspeedMs * 6.5);
  const altitudeFt = Math.round((nextY + 2.0) * 32.8);
  const groundAltitudeFt =
    terrainMode === 'mountains' ? Math.max(0, Math.round((groundY + 2.0) * 32.8)) : 0;
  const stepDist = Math.sqrt(vx * vx + vz * vz) * clampedDt;

  return {
    x: nextX,
    y: nextY,
    z: nextZ,
    vx,
    vy,
    vz,
    forwardSpeed,
    lateralSpeed,
    airspeedKts,
    altitudeFt,
    groundAltitudeFt,
    headingDeg,
    yawAccumulator: newYawAccumulator,
    ringsCollected,
    distanceTraveled: Math.round((prevState.distanceTraveled + stepDist) * 10) / 10,
  };
}
