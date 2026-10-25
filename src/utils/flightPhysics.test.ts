import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTerrainHeight,
  stepFlightPhysics,
  INITIAL_FLIGHT_STATE,
  createInitialWaypoints,
  type JoystickInput,
} from './flightPhysics';
import { type IMUData } from './imuMath';

const baseIMU: IMUData = {
  pitch: 0,
  roll: 0,
  yaw: 0, // Facing North (-Z)
  timestamp: Date.now(),
};

test('getTerrainHeight keeps central airport runway corridor level and generates mountains outside', () => {
  const runwayCenter = getTerrainHeight(0, 0);
  const runwayNorth = getTerrainHeight(0, -30);
  assert.equal(runwayCenter, -2.0);
  assert.equal(runwayNorth, -2.0);

  // Mountain flanks have higher elevation than valley floor
  const mountainPeak = getTerrainHeight(65, -45);
  assert.ok(mountainPeak > runwayCenter, `Expected mountain (${mountainPeak}) > runway (${runwayCenter})`);
});

test('stepFlightPhysics moves aircraft forward (-Z at heading 0) when joystick Y > 0', () => {
  const remote: JoystickInput = {
    joyX: 0,
    joyY: 1.0, // Full forward
    autoCruise: false,
    cruiseThrottle: 0,
  };

  let state = { ...INITIAL_FLIGHT_STATE, x: 0, y: 10, z: 0 };
  for (let i = 0; i < 10; i++) {
    state = stepFlightPhysics(state, baseIMU, remote, 0.05);
  }

  assert.ok(state.forwardSpeed > 0, 'Forward speed should be positive');
  assert.ok(state.z < 0, `Aircraft should move forward along -Z (got z=${state.z})`);
});

test('stepFlightPhysics moves aircraft backward (+Z at heading 0) when joystick Y < 0', () => {
  const remote: JoystickInput = {
    joyX: 0,
    joyY: -1.0, // Full backward / reverse
    autoCruise: true, // Even if autoCruise is enabled, pulling joystick back moves backward
    cruiseThrottle: 0.5,
  };

  let state = { ...INITIAL_FLIGHT_STATE, x: 0, y: 10, z: 0 };
  for (let i = 0; i < 10; i++) {
    state = stepFlightPhysics(state, baseIMU, remote, 0.05);
  }

  assert.ok(state.forwardSpeed < 0, 'Forward speed should be negative when backing up');
  assert.ok(state.z > 0, `Aircraft should move backward along +Z (got z=${state.z})`);
});

test('stepFlightPhysics moves aircraft right (+X) and left (-X) when joystick X is deflected', () => {
  const remoteRight: JoystickInput = {
    joyX: 1.0, // Right
    joyY: 0,
    autoCruise: false,
    cruiseThrottle: 0,
  };

  let stateRight = { ...INITIAL_FLIGHT_STATE, x: 0, y: 10, z: 0 };
  stateRight = stepFlightPhysics(stateRight, baseIMU, remoteRight, 0.05);
  assert.ok(stateRight.lateralSpeed > 0, 'Lateral speed should be positive for right deflection');
  assert.ok(stateRight.x > 0, `Aircraft should move right (+X), got x=${stateRight.x}`);

  const remoteLeft: JoystickInput = {
    joyX: -1.0, // Left
    joyY: 0,
    autoCruise: false,
    cruiseThrottle: 0,
  };

  let stateLeft = { ...INITIAL_FLIGHT_STATE, x: 0, y: 10, z: 0 };
  stateLeft = stepFlightPhysics(stateLeft, baseIMU, remoteLeft, 0.05);
  assert.ok(stateLeft.lateralSpeed < 0, 'Lateral speed should be negative for left deflection');
  assert.ok(stateLeft.x < 0, `Aircraft should move left (-X), got x=${stateLeft.x}`);
});

test('stepFlightPhysics collects waypoint rings when flying through them', () => {
  const waypoints = createInitialWaypoints();
  const firstRing = waypoints[0];

  const stateAtRing = {
    ...INITIAL_FLIGHT_STATE,
    x: firstRing.x,
    y: firstRing.y,
    z: firstRing.z + 1.0,
  };

  const remote: JoystickInput = {
    joyX: 0,
    joyY: 0.5,
    autoCruise: false,
    cruiseThrottle: 0,
  };

  const nextState = stepFlightPhysics(stateAtRing, baseIMU, remote, 0.05, waypoints);
  assert.equal(firstRing.collected, true);
  assert.equal(nextState.ringsCollected, 1);
});

test('stepFlightPhysics keeps aircraft and camera target 100% stationary when ESP32 rests on a desk with slight tilt and untouched joystick', () => {
  const deskIMU: IMUData = {
    pitch: 1.8, // slight desk tilt
    roll: -2.4, // slight breadboard tilt
    yaw: 42.0,
    joyX: 0,
    joyY: 0,
    timestamp: Date.now(),
  };

  const remote: JoystickInput = {
    joyX: 0,
    joyY: 0,
    autoCruise: false,
    cruiseThrottle: 0.65,
  };

  let state = { ...INITIAL_FLIGHT_STATE };
  const initialX = state.x;
  const initialY = state.y;
  const initialZ = state.z;

  for (let i = 0; i < 120; i++) {
    state = stepFlightPhysics(state, deskIMU, remote, 0.016);
  }

  assert.equal(state.x, initialX, 'X position must not drift when stationary');
  assert.equal(state.y, initialY, 'Y altitude must not drift when stationary');
  assert.equal(state.z, initialZ, 'Z position must not drift when stationary');
  assert.equal(state.headingDeg, 42.0, 'Heading must not drift from roll tilt when stationary');
});

test('stepFlightPhysics stops aircraft at one place when joystick is neutral and moves/turns when joystick is deflected', () => {
  const neutralIMU: IMUData = {
    pitch: 0,
    roll: 0,
    yaw: 0,
    joyX: 0,
    joyY: 0,
    timestamp: Date.now(),
  };

  const remote: JoystickInput = {
    joyX: 0,
    joyY: 0,
    autoCruise: false,
    cruiseThrottle: 0.65,
    swapVRxVRy: true,
    reverseX: true,
    reverseY: true,
    turnOnSideways: true,
  };

  let state = { ...INITIAL_FLIGHT_STATE, x: 0, y: 10, z: 0 };

  // 1. Neutral joystick: aircraft remains 100% stopped at one place
  for (let i = 0; i < 30; i++) {
    state = stepFlightPhysics(state, neutralIMU, remote, 0.05, undefined, 'clouds_only');
  }
  assert.equal(state.x, 0, 'Aircraft X must stay stopped at 0 when joystick is neutral');
  assert.equal(state.z, 0, 'Aircraft Z must stay stopped at 0 when joystick is neutral');
  assert.equal(state.airspeedKts, 0, 'Airspeed must be 0 KT when stopped');

  // 2. Joystick moved forward + right: aircraft turns right and moves forward/right
  const activeIMU: IMUData = {
    ...neutralIMU,
    joyX: -0.8, // Swapped to Y and reversed -> +0.8 forward
    joyY: -0.6, // Swapped to X and reversed -> +0.6 right turn & glide
  };
  state = stepFlightPhysics(state, activeIMU, remote, 0.05, undefined, 'clouds_only');
  assert.ok(state.z < 0, `Expected aircraft to move forward (-Z), got z=${state.z}`);
  assert.ok(state.x > 0, `Expected aircraft to move right (+X), got x=${state.x}`);
  assert.ok(state.headingDeg > 0 && state.headingDeg < 90, `Expected aircraft to turn right (+heading), got ${state.headingDeg}`);

  // 3. Joystick released back to center: aircraft decelerates and stops at the new place
  for (let i = 0; i < 60; i++) {
    state = stepFlightPhysics(state, neutralIMU, remote, 0.05, undefined, 'clouds_only');
  }
  assert.equal(state.forwardSpeed, 0, 'Forward speed must return to 0 when joystick is released');
  assert.equal(state.lateralSpeed, 0, 'Lateral speed must return to 0 when joystick is released');
  assert.equal(state.airspeedKts, 0, 'Airspeed must return to 0 KT when joystick is released');
});



