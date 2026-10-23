import React, { useState } from 'react';
import { X, Copy, Check, Download, Cpu, Terminal, Github, Cable } from 'lucide-react';

interface HardwareCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HardwareCodeModal: React.FC<HardwareCodeModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'mpu6050' | 'bno055' | 'python' | 'wiring' | 'github'>('mpu6050');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const mpu6050Code = `/**
 * ESP32 + MPU6050 IMU + Analog Joystick (KY-023) Custom Flight Remote Firmware
 * Transmits real-time pitch, roll, yaw, acceleration, and joystick (joyX, joyY, joyBtn)
 * over USB Serial at 115200 baud (50Hz) to control aircraft attitude & forward/backward/left/right flight!
 *
 * Wiring:
 *   MPU6050: VCC->3V3, GND->GND, SDA->GPIO21, SCL->GPIO22
 *   Joystick: VCC->3V3, GND->GND, VRx->GPIO34, VRy->GPIO35, SW->GPIO32
 */

#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

Adafruit_MPU6050 mpu;

// Analog Joystick Pins (ESP32 ADC1)
const int PIN_JOY_X  = 34; // VRx: Left (-1.0) / Right (+1.0)
const int PIN_JOY_Y  = 35; // VRy: Backward (-1.0) / Forward (+1.0)
const int PIN_JOY_SW = 32; // SW: Push Button (Active LOW)

float pitch = 0.0, roll = 0.0, yaw = 0.0;
float accOffsetX = 0.0, accOffsetY = 0.0, accOffsetZ = 0.0;
float gyroOffsetX = 0.0, gyroOffsetY = 0.0, gyroOffsetZ = 0.0;
int joyCenterX = 2048, joyCenterY = 2048;

unsigned long prevTime = 0;
const int CALIBRATION_SAMPLES = 250;

float normalizeAxis(int rawAdc, int center) {
  float norm = (rawAdc >= center)
    ? (float)(rawAdc - center) / (float)max(1, 4095 - center)
    : -(float)(center - rawAdc) / (float)max(1, center);
  norm = constrain(norm, -1.0, 1.0);
  return (abs(norm) < 0.07) ? 0.0 : norm; // Deadzone filter
}

void calibrateSensors() {
  Serial.println("// Calibrating MPU6050 + Joystick... Keep remote flat and thumbstick centered");
  float axSum = 0, aySum = 0, azSum = 0;
  float gxSum = 0, gySum = 0, gzSum = 0;
  long jxSum = 0, jySum = 0;

  for (int i = 0; i < CALIBRATION_SAMPLES; i++) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    axSum += a.acceleration.x;
    aySum += a.acceleration.y;
    azSum += a.acceleration.z - 9.81;
    gxSum += g.gyro.x;
    gySum += g.gyro.y;
    gzSum += g.gyro.z;
    jxSum += analogRead(PIN_JOY_X);
    jySum += analogRead(PIN_JOY_Y);
    delay(5);
  }

  accOffsetX = axSum / CALIBRATION_SAMPLES;
  accOffsetY = aySum / CALIBRATION_SAMPLES;
  accOffsetZ = azSum / CALIBRATION_SAMPLES;
  gyroOffsetX = gxSum / CALIBRATION_SAMPLES;
  gyroOffsetY = gySum / CALIBRATION_SAMPLES;
  gyroOffsetZ = gzSum / CALIBRATION_SAMPLES;
  joyCenterX = jxSum / CALIBRATION_SAMPLES;
  joyCenterY = jySum / CALIBRATION_SAMPLES;
  Serial.println("// Calibration done. Streaming IMU + Joystick flight telemetry...");
}

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  pinMode(PIN_JOY_X, INPUT);
  pinMode(PIN_JOY_Y, INPUT);
  pinMode(PIN_JOY_SW, INPUT_PULLUP);
  analogReadResolution(12);

  Wire.begin(21, 22, 400000);

  if (!mpu.begin()) {
    Serial.println("// ERROR: Failed to find MPU6050 chip. Check wiring!");
    while (1) delay(500);
  }

  mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  delay(100);
  calibrateSensors();
  prevTime = micros();
}

void loop() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  unsigned long currentTime = micros();
  float dt = (currentTime - prevTime) / 1000000.0;
  prevTime = currentTime;
  if (dt <= 0.0 || dt > 0.2) dt = 0.02;

  float ax = a.acceleration.x - accOffsetX;
  float ay = a.acceleration.y - accOffsetY;
  float az = a.acceleration.z - accOffsetZ;

  float gx = (g.gyro.x - gyroOffsetX) * 180.0 / PI;
  float gy = (g.gyro.y - gyroOffsetY) * 180.0 / PI;
  float gz = (g.gyro.z - gyroOffsetZ) * 180.0 / PI;

  float accPitch = atan2(-ax, sqrt(ay * ay + az * az)) * 180.0 / PI;
  float accRoll  = atan2(ay, az) * 180.0 / PI;

  // Complementary Filter (97% Gyro Integration, 3% Accelerometer)
  pitch = 0.97 * (pitch + gy * dt) + 0.03 * accPitch;
  roll  = 0.97 * (roll  + gx * dt) + 0.03 * accRoll;
  yaw   += gz * dt;

  // Read Analog Joystick (Forward/Backward = joyY, Left/Right = joyX)
  float joyX = normalizeAxis(analogRead(PIN_JOY_X), joyCenterX);
  float joyY = normalizeAxis(analogRead(PIN_JOY_Y), joyCenterY);
  int joyBtn = (digitalRead(PIN_JOY_SW) == LOW) ? 1 : 0;

  yaw += joyX * 45.0 * dt;
  while (yaw >= 360.0) yaw -= 360.0;
  while (yaw < 0.0)    yaw += 360.0;

  // Transmit 9-field CSV: pitch,roll,yaw,ax,ay,az,joyX,joyY,joyBtn
  Serial.printf("%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%d\\n",
                pitch, roll, yaw, ax, ay, az, joyX, joyY, joyBtn);

  delay(20); // ~50 Hz update rate
}
`;

  const bno055Code = `/**
 * ESP32 + Bosch BNO055 9-DOF IMU + Dual-Axis Analog Joystick Flight Remote
 * Built-in sensor fusion coprocessor + analog thumbstick for forward/backward/left/right flight.
 */

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BNO055.h>
#include <utility/imumaths.h>

Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28, &Wire);

const int PIN_JOY_X  = 34;
const int PIN_JOY_Y  = 35;
const int PIN_JOY_SW = 32;
int joyCenterX = 2048, joyCenterY = 2048;

float normalizeAxis(int rawAdc, int center) {
  float norm = (rawAdc >= center)
    ? (float)(rawAdc - center) / (float)max(1, 4095 - center)
    : -(float)(center - rawAdc) / (float)max(1, center);
  norm = constrain(norm, -1.0, 1.0);
  return (abs(norm) < 0.07) ? 0.0 : norm;
}

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  pinMode(PIN_JOY_X, INPUT);
  pinMode(PIN_JOY_Y, INPUT);
  pinMode(PIN_JOY_SW, INPUT_PULLUP);
  analogReadResolution(12);

  Wire.begin(21, 22, 400000); // ESP32 SDA=21, SCL=22

  if (!bno.begin()) {
    Serial.println("// ERROR: BNO055 not detected. Check I2C address and wiring!");
    while (1) delay(500);
  }

  delay(200);
  bno.setExtCrystalUse(true);
  joyCenterX = analogRead(PIN_JOY_X);
  joyCenterY = analogRead(PIN_JOY_Y);
  Serial.println("// BNO055 + Joystick streaming 9-DOF flight telemetry...");
}

void loop() {
  imu::Vector<3> euler = bno.getVector(Adafruit_BNO055::VECTOR_EULER);
  imu::Vector<3> acc   = bno.getVector(Adafruit_BNO055::VECTOR_LINEARACCEL);

  float yaw   = euler.x(); // 0 to 360 degrees
  float roll  = euler.y(); // -180 to 180 degrees
  float pitch = euler.z(); // -90 to 90 degrees

  float joyX = normalizeAxis(analogRead(PIN_JOY_X), joyCenterX);
  float joyY = normalizeAxis(analogRead(PIN_JOY_Y), joyCenterY);
  int joyBtn = (digitalRead(PIN_JOY_SW) == LOW) ? 1 : 0;

  // Transmit standard telemetry sentence: pitch,roll,yaw,ax,ay,az,joyX,joyY,joyBtn
  Serial.printf("%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%d\\n",
                pitch, roll, yaw, acc.x(), acc.y(), acc.z(), joyX, joyY, joyBtn);

  delay(20); // 50 Hz
}
`;

  const pythonCode = `#!/usr/bin/env python3
"""
mac_imu_bridge.py
macOS Python Serial-to-WebSocket Bridge for ESP32 IMU + Joystick Telemetry

Requirements:
    pip3 install pyserial websockets

Run:
    python3 scripts/mac_imu_bridge.py                               # Auto-detect ESP32 USB port
    python3 scripts/mac_imu_bridge.py --port /dev/cu.usbserial-0001 # Explicit USB port
    python3 scripts/mac_imu_bridge.py --simulate                    # Test WebSocket without ESP32
"""

import argparse
import asyncio
import glob
import math
import time
import serial
import websockets

DEFAULT_BAUD = 115200
DEFAULT_WS_PORT = 8765
connected_clients = set()

def find_esp32_port():
    """Auto-detects USB serial device on macOS."""
    patterns = [
        '/dev/cu.usbserial*',
        '/dev/cu.SLAB_USBtoUART*',
        '/dev/cu.wchusbserial*',
        '/dev/cu.usbmodem*',
        '/dev/tty.usbserial*',
        '/dev/tty.SLAB_USBtoUART*',
        '/dev/tty.wchusbserial*',
    ]
    detected = []
    for pat in patterns:
        detected.extend(glob.glob(pat))
    return detected[0] if detected else None

async def broadcast_serial_imu(ser):
    loop = asyncio.get_running_loop()
    print("Reading ESP32 IMU + Joystick telemetry...")
    while True:
        try:
            line = await loop.run_in_executor(None, ser.readline)
            decoded = line.decode('utf-8', errors='ignore').strip()
            if decoded and not decoded.startswith('//') and connected_clients:
                await asyncio.gather(
                    *[client.send(decoded) for client in connected_clients],
                    return_exceptions=True
                )
        except Exception as e:
            print(f"Serial read error: {e}")
            await asyncio.sleep(0.1)

async def broadcast_simulated_imu():
    print("Streaming 50Hz SIMULATED IMU + Joystick telemetry over WebSocket...")
    t0 = time.time()
    while True:
        t = time.time() - t0
        pitch = math.sin(t * 0.9) * 18.0 + math.cos(t * 0.4) * 6.0
        roll = math.cos(t * 0.7) * 32.0 + math.sin(t * 1.3) * 8.0
        yaw = (t * 22.0) % 360.0
        ax = -math.sin(math.radians(pitch)) * 9.81
        ay = math.sin(math.radians(roll)) * math.cos(math.radians(pitch)) * 9.81
        az = math.cos(math.radians(roll)) * math.cos(math.radians(pitch)) * 9.81
        joy_x = math.sin(t * 0.5) * 0.45
        joy_y = 0.75
        payload = f"{pitch:.2f},{roll:.2f},{yaw:.2f},{ax:.2f},{ay:.2f},{az:.2f},{joy_x:.2f},{joy_y:.2f},0"
        if connected_clients:
            await asyncio.gather(
                *[client.send(payload) for client in connected_clients],
                return_exceptions=True
            )
        await asyncio.sleep(0.02)

async def ws_handler(websocket):
    connected_clients.add(websocket)
    print(f"Browser connected. Active clients: {len(connected_clients)}")
    try:
        await websocket.wait_closed()
    finally:
        connected_clients.discard(websocket)
        print(f"Browser disconnected. Active clients: {len(connected_clients)}")

async def main():
    parser = argparse.ArgumentParser(description="macOS ESP32 IMU + Joystick WebSocket Bridge")
    parser.add_argument("positional_port", nargs="?", default=None)
    parser.add_argument("--port", "-p", default=None)
    parser.add_argument("--baud", "-b", type=int, default=DEFAULT_BAUD)
    parser.add_argument("--ws-port", type=int, default=DEFAULT_WS_PORT)
    parser.add_argument("--simulate", "-s", action="store_true")
    args = parser.parse_args()

    server = await websockets.serve(ws_handler, "localhost", args.ws_port)
    print(f"WebSocket Server running at ws://localhost:{args.ws_port}")

    if args.simulate:
        await broadcast_simulated_imu()
        return

    port = args.port or args.positional_port or find_esp32_port()
    if not port:
        print("No ESP32 detected on USB. Falling back to --simulate mode...")
        await broadcast_simulated_imu()
        return

    print(f"Connecting to ESP32 on port: {port} at {args.baud} baud...")
    try:
        ser = serial.Serial(port, args.baud, timeout=1)
    except Exception as e:
        print(f"Error opening port {port}: {e}")
        return

    await broadcast_serial_imu(ser)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\\nBridge stopped.")
`;

  const wiringGuide = `======================================================================
ESP32 + IMU (MPU6050/BNO055) + ANALOG JOYSTICK CUSTOM FLIGHT REMOTE
======================================================================

1. ESP32 to IMU Sensor (MPU-6050 or BNO055) I2C Pinout:
   -------------------------------------------------------------------
   ESP32 DevKit Board           IMU Sensor Module (MPU6050 / BNO055)
   -------------------------------------------------------------------
   3V3 (3.3V Power)      -----> VCC / VIN  (Use 3.3V!)
   GND (Ground)          -----> GND
   GPIO 21 (I2C SDA)     -----> SDA (Serial Data)
   GPIO 22 (I2C SCL)     -----> SCL (Serial Clock)
   GND                   -----> AD0 (Sets I2C address to 0x68)
   -------------------------------------------------------------------

2. ESP32 to 2-Axis Analog Joystick Module (KY-023 / PS2 Thumbstick):
   -------------------------------------------------------------------
   ESP32 DevKit Board           Analog Joystick Pin
   -------------------------------------------------------------------
   3V3 (3.3V Power)      -----> +5V / VCC  (Power with 3.3V so ADC = 0..3.3V)
   GND (Ground)          -----> GND
   GPIO 34 (ADC1_CH6)    -----> VRx (X-Axis: Left / Right Plane Movement)
   GPIO 35 (ADC1_CH7)    -----> VRy (Y-Axis: Forward / Backward Thrust)
   GPIO 32 (Digital In)  -----> SW  (Push Button: Afterburner Boost)
   -------------------------------------------------------------------

3. How the Custom Remote Controls the 3D Plane & Terrain:
   - Tilt the ESP32 + IMU in your hand:
     * Pitch (tilt nose up/down) -> Plane climbs over mountains or dives into valleys!
     * Roll (bank left/right)    -> Wings bank and induce smooth coordinated turns!
   - Push the Analog Thumbstick (Joystick):
     * Push Forward (VRy > center)  -> Plane accelerates forward along its heading
     * Pull Backward (VRy < center) -> Plane reverses / moves backward
     * Push Left/Right (VRx)        -> Plane moves & steers left/right across the terrain
     * Press Thumbstick Button (SW) -> Engages Afterburner Speed Boost!
`;

  const githubWorkflowCode = `# .github/workflows/deploy.yml
name: Deploy AeroSync Flight Simulation to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: npm install --legacy-peer-deps

      - name: Build static Vite application
        run: npm run build

      - name: Add .nojekyll and SPA 404 fallback
        run: |
          touch ./dist/.nojekyll
          cp ./dist/index.html ./dist/404.html

      - name: Publish dist to gh-pages branch
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: \${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
          force_orphan: true

      - name: Configure GitHub Pages
        id: pages
        uses: actions/configure-pages@v5
        continue-on-error: true
        with:
          enablement: true

      - name: Upload Pages artifact
        if: steps.pages.outcome == 'success'
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

  deploy:
    needs: build
    runs-on: ubuntu-24.04
    continue-on-error: true
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

  const currentCode =
    activeTab === 'mpu6050'
      ? mpu6050Code
      : activeTab === 'bno055'
      ? bno055Code
      : activeTab === 'python'
      ? pythonCode
      : activeTab === 'wiring'
      ? wiringGuide
      : githubWorkflowCode;

  const currentFilename =
    activeTab === 'mpu6050'
      ? 'esp32_mpu6050_telemetry.ino'
      : activeTab === 'bno055'
      ? 'esp32_bno055_telemetry.ino'
      : activeTab === 'python'
      ? 'mac_imu_bridge.py'
      : activeTab === 'wiring'
      ? 'esp32_imu_joystick_wiring.txt'
      : 'deploy.yml';

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(currentCode);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = currentCode;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch {
        // Ignore clipboard restrictions
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([currentCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = currentFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950 flex items-center justify-center text-sky-700 dark:text-sky-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                ESP32 IMU + Joystick Remote Firmware & Python Bridge
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Complete Arduino C++ code for ESP32 + MPU6050/BNO055 + Dual-Axis Analog Joystick (GPIO 34/35/32)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Firmware Modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Strip */}
        <div className="flex flex-wrap items-center justify-between px-6 py-2.5 bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-xs gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('mpu6050')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'mpu6050'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>ESP32 MPU6050 + Joystick</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('bno055')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'bno055'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>ESP32 BNO055 + Joystick</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('python')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'python'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Mac Python Bridge</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('wiring')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'wiring'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Cable className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>IMU + Joystick Wiring</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('github')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'github'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Github className="w-3.5 h-3.5 text-slate-800 dark:text-slate-200" />
              <span>GitHub Pages</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium cursor-pointer"
              title={`Download ${currentFilename}`}
            >
              <Download className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>Download</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? 'Copied!' : 'Copy Code'}</span>
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-950 font-mono text-xs text-slate-200">
          <pre className="whitespace-pre overflow-x-auto leading-relaxed">
            {currentCode}
          </pre>
        </div>

        {/* Footer Notes */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
          <span>
            {activeTab === 'mpu6050' && 'Streams 9-field CSV "pitch,roll,yaw,ax,ay,az,joyX,joyY,joyBtn" at 50Hz over USB serial.'}
            {activeTab === 'bno055' && 'Hardware 9-DOF fusion + Analog Joystick on GPIO 34/35/32.'}
            {activeTab === 'python' && 'Reads ESP32 IMU + Joystick serial on macOS and broadcasts via WebSockets on ws://localhost:8765.'}
            {activeTab === 'wiring' && 'Connect IMU to GPIO21/22 (I2C) and Analog Joystick to GPIO34 (VRx), GPIO35 (VRy), GPIO32 (SW).'}
            {activeTab === 'github' && 'In GitHub Repo Settings → Pages → Source, select "GitHub Actions" to allow automated deployment!'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
