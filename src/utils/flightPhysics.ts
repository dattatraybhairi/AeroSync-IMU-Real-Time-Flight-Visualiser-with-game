/**
 * Pure 3D Flight Simulator Physics, Custom Remote Joystick Kinematics, and Procedural Terrain Heightmap Math.
 * Decoupled from Three.js / React DOM for fast unit testing.
 */

import { degreesToRadians, normalizeHeading360, type IMUData } from './imuMath';

export interface JoystickInput {
  joyX: number; // [-1, 1] Left (-1) / Right (+1) movement & steering
  joyY: number; // [-1, 1] Backward (-1) / Forward (+1) thrust & speed
  boost?: boolean;
  cruiseThrottle: number; // [0, 1] baseline cruise thrust when autoCruise is active
  autoCruise: boolean;
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
  headingDeg: number;   // Dynamic heading combining IMU yaw + joystick steering [0, 360)
  yawAccumulator: number; // Accumulated yaw offset from joystick X steering
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
 * - Joystick / Custom Remote input (joyX = left/right, joyY = forward/backward, boost, autoCruise)
 *
 * Ensures:
 * - Pushing Joystick Forward (joyY > 0) moves the plane forward along its heading.
 * - Pulling Joystick Backward (joyY < 0) moves the plane backward (reverse thrust / backing up).
 * - Moving Joystick Left/Right (joyX < 0 or joyX > 0) moves the plane left/right (lateral strafe + turn).
 * - Tilting IMU Pitch up/down climbs or descends in altitude, with terrain floor collision guard.
 */
export function stepFlightPhysics(
  prevState: FlightPositionState,
  imu: IMUData,
  remote: JoystickInput,
  dt: number,
  waypoints?: WaypointRing[]
): FlightPositionState {
  const clampedDt = Math.min(Math.max(dt, 0.001), 0.1);

  // Combine hardware IMU joystick telemetry (if present) with UI/Keyboard remote joystick
  const effectiveJoyX =
    imu.joyX !== undefined && Math.abs(imu.joyX) > Math.abs(remote.joyX)
      ? imu.joyX
      : remote.joyX;

  const effectiveJoyY =
    imu.joyY !== undefined && Math.abs(imu.joyY) > Math.abs(remote.joyY)
      ? imu.joyY
      : remote.joyY;

  const boostMultiplier = remote.boost || imu.joyBtn ? 1.65 : 1.0;

  // Target forward/backward velocity (m/s):
  // If user actively pulls backward (effectiveJoyY < -0.05), allow direct backward movement even if autoCruise is on!
  let targetForwardCmd = effectiveJoyY;
  if (remote.autoCruise && effectiveJoyY >= -0.05) {
    targetForwardCmd = Math.max(remote.cruiseThrottle, effectiveJoyY);
  }

  const maxForwardSpeed = 28.0 * boostMultiplier; // m/s
  const targetForwardSpeed = targetForwardCmd * maxForwardSpeed;

  // Target left/right lateral velocity (m/s) strictly from Joystick X input
  // (plus gentle roll bank assist ONLY when actively flying forward/backward outside a 5° roll deadzone)
  const activeRollDeg = Math.abs(imu.roll) > 5.0 ? imu.roll : 0;
  const isActivelyFlying = Math.abs(targetForwardSpeed) > 0.5 || Math.abs(prevState.forwardSpeed) > 0.5;
  const rollBankFactor = isActivelyFlying
    ? Math.sin(degreesToRadians(Math.max(-65, Math.min(65, activeRollDeg)))) * 0.25
    : 0;
  const maxLateralSpeed = 18.0 * boostMultiplier;
  const targetLateralSpeed =
    Math.max(-1, Math.min(1, effectiveJoyX + (Math.abs(effectiveJoyX) > 0.01 ? rollBankFactor * 0.3 : 0))) *
    maxLateralSpeed;

  // Smooth exponential damping for responsive yet weighty flight feel
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

  // Yaw steering accumulator ONLY turns when Joystick X is actively deflected (prevents stationary IMU roll from spinning heading)
  const turnRateDegPerSec =
    Math.abs(effectiveJoyX) > 0.01 ? effectiveJoyX * 48 * boostMultiplier : 0;
  const newYawAccumulator = normalizeHeading360(
    prevState.yawAccumulator + turnRateDegPerSec * clampedDt
  );
  const headingDeg = normalizeHeading360(imu.yaw + newYawAccumulator);
  const headingRad = degreesToRadians(headingDeg);

  // In Three.js aeronautical coordinates:
  // Heading 0° (North) points along -Z: forward = (-sin(hdg), 0, -cos(hdg))
  // Right wing (East at 0° hdg) points along +X: right = (cos(hdg), 0, -sin(hdg))
  const fwdX = -Math.sin(headingRad);
  const fwdZ = -Math.cos(headingRad);
  const rightX = Math.cos(headingRad);
  const rightZ = -Math.sin(headingRad);

  const vx = fwdX * forwardSpeed + rightX * lateralSpeed;
  const vz = fwdZ * forwardSpeed + rightZ * lateralSpeed;

  // Vertical climb/descent rate from Pitch angle ONLY when the aircraft is actually moving forward/backward
  const pitchDeadbanded = Math.abs(imu.pitch) > 2.5 ? imu.pitch : 0;
  const pitchRad = degreesToRadians(Math.max(-65, Math.min(65, pitchDeadbanded)));
  const activeSpeedMag = Math.abs(forwardSpeed) + Math.abs(lateralSpeed) * 0.35;
  const vy = activeSpeedMag > 0.2 ? Math.sin(pitchRad) * activeSpeedMag * 0.65 : 0;

  let nextX = prevState.x + vx * clampedDt;
  let nextZ = prevState.z + vz * clampedDt;
  let nextY = prevState.y + vy * clampedDt;

  // Wrap around world bounds [-WORLD_BOUNDS, +WORLD_BOUNDS] seamlessly
  if (nextX > WORLD_BOUNDS) nextX -= WORLD_BOUNDS * 2;
  if (nextX < -WORLD_BOUNDS) nextX += WORLD_BOUNDS * 2;
  if (nextZ > WORLD_BOUNDS) nextZ -= WORLD_BOUNDS * 2;
  if (nextZ < -WORLD_BOUNDS) nextZ += WORLD_BOUNDS * 2;

  // Terrain collision floor & ceiling clamp so aircraft never clips underground
  const groundY = getTerrainHeight(nextX, nextZ);
  const minClearanceY = groundY + 1.8;
  const maxCeilingY = 58.0;
  nextY = Math.max(minClearanceY, Math.min(maxCeilingY, nextY));

  // Waypoint ring collection check
  let ringsCollected = prevState.ringsCollected;
  if (waypoints) {
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
  const airspeedKts = Math.round(totalSpeedMs * 6.5); // Scaled knots for flight sim feel
  const altitudeFt = Math.round((nextY + 2.0) * 32.8);
  const groundAltitudeFt = Math.max(0, Math.round((groundY + 2.0) * 32.8));
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
