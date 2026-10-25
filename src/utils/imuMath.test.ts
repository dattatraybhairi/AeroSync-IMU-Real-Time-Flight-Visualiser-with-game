import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIMUString,
  applyCalibration,
  computeTareCalibration,
  normalizeAngle180,
  normalizeHeading360,
  normalizeJoystickAxis,
  DEFAULT_CALIBRATION,
  generateSimulatedAttitude,
  deviceOrientationToIMU,
  accelerometerToAttitude,
  type CalibrationConfig,
} from './imuMath';

test('normalizeAngle180 clamps within [-180, 180]', () => {
  assert.equal(normalizeAngle180(0), 0);
  assert.equal(normalizeAngle180(190), -170);
  assert.equal(normalizeAngle180(-190), 170);
  assert.equal(normalizeAngle180(360), 0);
});

test('normalizeHeading360 normalizes within [0, 360)', () => {
  assert.equal(normalizeHeading360(0), 0);
  assert.equal(normalizeHeading360(360), 0);
  assert.equal(normalizeHeading360(-30), 330);
  assert.equal(normalizeHeading360(390), 30);
});

test('normalizeJoystickAxis normalizes normalized floats, percentages, and 12-bit ESP32 ADC values', () => {
  assert.equal(normalizeJoystickAxis(0), 0);
  assert.equal(normalizeJoystickAxis(0.03), 0); // inside deadzone
  assert.equal(normalizeJoystickAxis(0.75), 0.75);
  assert.equal(normalizeJoystickAxis(-0.8), -0.8);
  // ESP32 12-bit ADC center ~2048 -> 0, 4095 -> +1
  assert.equal(normalizeJoystickAxis(2048), 0);
  assert.equal(normalizeJoystickAxis(4095), 1);
  // Percentage (-100..100)
  assert.equal(normalizeJoystickAxis(50), 0.5);
  assert.equal(normalizeJoystickAxis(-75), -0.75);
});

test('parseIMUString parses CSV formats including ESP32 joystick channels', () => {
  const result1 = parseIMUString('15.5, -20.2, 180.0');
  assert.ok(result1);
  assert.equal(result1.pitch, 15.5);
  assert.equal(result1.roll, -20.2);
  assert.equal(result1.yaw, 180.0);

  // 8-value CSV: pitch,roll,yaw,ax,ay,az,joyX,joyY,joyBtn
  const resultWithJoy = parseIMUString('10.0, -5.0, 90.0, 0.1, 0.2, 9.8, 0.65, -0.45, 1');
  assert.ok(resultWithJoy);
  assert.equal(resultWithJoy.pitch, 10.0);
  assert.equal(resultWithJoy.joyX, 0.65);
  assert.equal(resultWithJoy.joyY, -0.45);
  assert.equal(resultWithJoy.joyBtn, true);

  // 5-value shorthand CSV: pitch,roll,yaw,joyX,joyY
  const resultShortJoy = parseIMUString('5.0, 12.0, 45.0, -0.5, 0.9');
  assert.ok(resultShortJoy);
  assert.equal(resultShortJoy.joyX, -0.5);
  assert.equal(resultShortJoy.joyY, 0.9);
});

test('parseIMUString parses Key-Value and JSON formats with joystick axes', () => {
  const kv = parseIMUString('P: 22.4, R: -11.8, Y: 315.0, JX: 0.4, JY: 0.85, BTN: 1');
  assert.ok(kv);
  assert.equal(kv.pitch, 22.4);
  assert.equal(kv.joyX, 0.4);
  assert.equal(kv.joyY, 0.85);
  assert.equal(kv.joyBtn, true);

  const json = parseIMUString('{"pitch": -5.5, "roll": 12.3, "yaw": 270.0, "joyX": -0.35, "joyY": 0.6}');
  assert.ok(json);
  assert.equal(json.pitch, -5.5);
  assert.equal(json.joyX, -0.35);
  assert.equal(json.joyY, 0.6);

  // ST7735 X/Y format and 2-value pitch,roll CSV
  const xyFormat = parseIMUString('X 14.2 Y -8.6');
  assert.ok(xyFormat);
  assert.equal(xyFormat.pitch, 14.2);
  assert.equal(xyFormat.roll, -8.6);

  const twoValCsv = parseIMUString('9.5, -12.4');
  assert.ok(twoValCsv);
  assert.equal(twoValCsv.pitch, 9.5);
  assert.equal(twoValCsv.roll, -12.4);
});

test('applyCalibration handles offsets and inversions while preserving joystick fields', () => {
  const raw = {
    pitch: 10,
    roll: 5,
    yaw: 90,
    joyX: 0.5,
    joyY: 0.8,
    timestamp: Date.now(),
  };

  const config: CalibrationConfig = {
    ...DEFAULT_CALIBRATION,
    pitchOffset: 10,
    rollOffset: 5,
    yawOffset: 90,
    smoothingFactor: 0,
  };

  const calibrated = applyCalibration(raw, config);
  assert.equal(calibrated.pitch, 0);
  assert.equal(calibrated.roll, 0);
  assert.equal(calibrated.yaw, 0);
  assert.equal(calibrated.joyX, 0.5);
  assert.equal(calibrated.joyY, 0.8);
});

test('deviceOrientationToIMU maps portrait and landscape sensors', () => {
  const portrait = deviceOrientationToIMU(90, 25, -15, 0);
  assert.equal(portrait.pitch, 25);
  assert.equal(portrait.roll, -15);
  assert.equal(portrait.yaw, 270);

  const landscape = deviceOrientationToIMU(0, 20, -10, 90);
  assert.equal(landscape.pitch, 10);
  assert.equal(landscape.roll, 20);
  assert.equal(landscape.yaw, 0);
});

test('accelerometerToAttitude calculates pitch and roll from gravity vector', () => {
  const flat = accelerometerToAttitude(0, 0, 9.81, 45);
  assert.equal(flat.pitch, 0);
  assert.equal(flat.roll, 0);
  assert.equal(flat.yaw, 45);
});

test('generateSimulatedAttitude produces continuous flight values', () => {
  const att1 = generateSimulatedAttitude('climb_dive', 0);
  assert.ok(typeof att1.pitch === 'number');
  assert.ok(typeof att1.roll === 'number');
  assert.ok(typeof att1.yaw === 'number');
});

test('computeTareCalibration zeroes tilted MPU6050 stream (-84.55,-18.96,223.50) to (0, 0, 0)', () => {
  const pkt1 = parseIMUString('-84.55,-18.96,223.50,12.35,-0.18,0.68,0.00,0.00,0')!;
  const pkt2 = parseIMUString('-84.64,-19.33,223.54,12.27,-0.20,0.67,0.00,0.00,0')!;
  assert.ok(pkt1 && pkt2);

  const taredCfg = computeTareCalibration(pkt1, DEFAULT_CALIBRATION);
  const cal1 = applyCalibration(pkt1, taredCfg);
  assert.equal(cal1.pitch, 0);
  assert.equal(cal1.roll, 0);
  assert.equal(cal1.yaw, 0);

  const cal2 = applyCalibration(pkt2, taredCfg, cal1);
  assert.equal(cal2.pitch, 0);
  assert.equal(cal2.roll, 0);
  assert.equal(cal2.yaw, 0);
});

