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
 * ESP32 + ST7735 128x160 SPI TFT PFD + MPU6050 IMU + Analog Joystick Telemetry
 *
 * 1. Draws the moving Artificial Horizon PFD (Sky/Ground, Pitch Ladder, Bank Scale,
 *    Fixed Yellow Aircraft Symbol, and X/Y Angle Panel) on the ST7735 128x160 TFT.
 * 2. Streams synchronized 50Hz CSV telemetry over USB Serial (115200 baud) so the
 *    AeroSync Web Simulator's on-screen ST7735 TFT & 3D Aircraft move in lockstep!
 */

#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <math.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>

// ---------- TFT PINS ----------
#define TFT_SCLK 18
#define TFT_MOSI 23
#define TFT_CS    5
#define TFT_DC    2
#define TFT_RST   4

// ---------- MPU6050 I2C ----------
#define MPU_ADDR 0x68
#define MPU_SDA  21
#define MPU_SCL  22

// ---------- ANALOG JOYSTICK & GPIO CALIBRATION BUTTON PINS ----------
#define PIN_JOY_X    34
#define PIN_JOY_Y    35
#define PIN_JOY_SW   32  // Joystick Push-Button (Active LOW -> Calibrates IMU 0,0)
#define PIN_CAL_BTN  27  // Optional External GPIO Push-Button to GND (Calibrates IMU 0,0)
#define PIN_BOOT_BTN  0  // Built-in ESP32 BOOT Button (Active LOW -> Calibrates IMU 0,0)

Adafruit_ST7735 tft(TFT_CS, TFT_DC, TFT_RST);

// ---------- DISPLAY ----------
const int W = 128;
const int H = 160;
const int CX = 64;
const int CY = 80;

// RGB565 colors
const uint16_t SKY    = 0x351F;
const uint16_t GROUND = 0xA145;
const uint16_t WHITE  = 0xFFFF;
const uint16_t YELLOW = 0xFFE0;
const uint16_t BLACK  = 0x0000;

// ---------- CALIBRATED ZERO OFFSETS (Set at boot or via GPIO button) ----------
float pitchZeroOffset = 0.0f;
float rollZeroOffset  = 0.0f;

// ---------- ATTITUDE ----------
float pitchDeg = 0.0f;
float rollDeg  = 0.0f;
float yawDeg   = 0.0f;
float lastAx = 0.0f, lastAy = 0.0f, lastAz = 9.81f;

float gyroXBias = 0.0f;
float gyroYBias = 0.0f;
float gyroZBias = 0.0f;

int joyCenterX = 2048, joyCenterY = 2048;
bool hasJoystickHardware = false;

uint32_t lastMicros = 0;
uint32_t lastDraw   = 0;
uint32_t lastSerial = 0;

// ---------- MPU6050 WRITE ----------
void writeMPU(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

// ---------- READ SENSOR ----------
bool readMPU(
  int16_t &ax, int16_t &ay, int16_t &az,
  int16_t &gx, int16_t &gy, int16_t &gz
) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);

  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU_ADDR, 14, true) != 14) return false;

  ax = (int16_t)((Wire.read() << 8) | Wire.read());
  ay = (int16_t)((Wire.read() << 8) | Wire.read());
  az = (int16_t)((Wire.read() << 8) | Wire.read());

  Wire.read();
  Wire.read();  // Temperature

  gx = (int16_t)((Wire.read() << 8) | Wire.read());
  gy = (int16_t)((Wire.read() << 8) | Wire.read());
  gz = (int16_t)((Wire.read() << 8) | Wire.read());

  return true;
}

float normalizeAxis(int rawAdc, int center) {
  float norm = (rawAdc >= center)
    ? (float)(rawAdc - center) / (float)max(1, 4095 - center)
    : -(float)(center - rawAdc) / (float)max(1, center);
  norm = constrain(norm, -1.0f, 1.0f);
  return (fabsf(norm) < 0.12f) ? 0.0f : norm;
}

// ---------- GYRO CALIBRATION ----------
void calibrateGyro() {
  int64_t sumX = 0, sumY = 0, sumZ = 0;
  long jxSum = 0, jySum = 0;
  int jxMin = 4095, jxMax = 0;
  int samples = 0;

  Serial.println("// Keep MPU6050 stationary...");

  for (int i = 0; i < 500; i++) {
    int16_t ax, ay, az, gx, gy, gz;
    if (readMPU(ax, ay, az, gx, gy, gz)) {
      sumX += gx;
      sumY += gy;
      sumZ += gz;
      samples++;
    }
    int rx = analogRead(PIN_JOY_X);
    int ry = analogRead(PIN_JOY_Y);
    jxSum += rx;
    jySum += ry;
    if (rx < jxMin) jxMin = rx;
    if (rx > jxMax) jxMax = rx;
    delay(3);
  }

  if (samples > 0) {
    gyroXBias = (float)sumX / samples;
    gyroYBias = (float)sumY / samples;
    gyroZBias = (float)sumZ / samples;
  }
  joyCenterX = jxSum / 500;
  joyCenterY = jySum / 500;
  hasJoystickHardware = (joyCenterX > 1000 && joyCenterX < 3100 &&
                         joyCenterY > 1000 && joyCenterY < 3100 &&
                         (jxMax - jxMin) < 180);
}

// ---------- ATTITUDE FILTER ----------
void updateAttitude(float dt) {
  int16_t ax, ay, az, gx, gy, gz;
  if (!readMPU(ax, ay, az, gx, gy, gz)) return;

  float x = ax / 16384.0f;
  float y = ay / 16384.0f;
  float z = az / 16384.0f;
  lastAx = x * 9.81f;
  lastAy = y * 9.81f;
  lastAz = z * 9.81f;

  float accelRoll  = atan2f(y, z) * 180.0f / PI;
  float accelPitch = atan2f(-x, sqrtf(y * y + z * z)) * 180.0f / PI;

  float rateX = (gx - gyroXBias) / 131.0f;
  float rateY = (gy - gyroYBias) / 131.0f;
  float rateZ = (gz - gyroZBias) / 131.0f;

  if (fabsf(rateX) < 0.5f) rateX = 0.0f;
  if (fabsf(rateY) < 0.5f) rateY = 0.0f;
  if (fabsf(rateZ) < 0.8f) rateZ = 0.0f;

  const float alpha = 0.96f;
  rollDeg  = alpha * (rollDeg  + rateX * dt) + (1.0f - alpha) * accelRoll;
  pitchDeg = alpha * (pitchDeg + rateY * dt) + (1.0f - alpha) * accelPitch;
  yawDeg  += rateZ * dt;
  while (yawDeg >= 360.0f) yawDeg -= 360.0f;
  while (yawDeg < 0.0f)    yawDeg += 360.0f;
}

// ---------- CALIBRATE CURRENT POSITION AS (0, 0, 0) ----------
void calibrateCurrentPosition() {
  pitchZeroOffset = pitchDeg;
  rollZeroOffset  = rollDeg;
  yawDeg          = 0.0f;
  if (hasJoystickHardware) {
    joyCenterX = analogRead(PIN_JOY_X);
    joyCenterY = analogRead(PIN_JOY_Y);
  }
}

// ---------- FULL-SCREEN HORIZON ----------
void drawHorizon() {
  float p = constrain(pitchDeg - pitchZeroOffset, -35.0f, 35.0f);
  float r = constrain(rollDeg  - rollZeroOffset,  -60.0f, 60.0f);

  float angle = r * PI / 180.0f;
  float cs = cosf(angle);
  float sn = sinf(angle);
  float pitchShift = p * 1.65f;

  // Draw full-screen sky and ground.
  for (int y = 0; y < H; y++) {
    int runStart = 0;
    uint16_t runColor = BLACK;

    for (int x = 0; x <= W; x++) {
      uint16_t color = BLACK;
      if (x < W) {
        float dx = x - CX;
        float dy = y - CY - pitchShift;
        float localY = -dx * sn + dy * cs;
        color = (localY < 0.0f) ? SKY : GROUND;
      }
      if (x == 0) {
        runStart = 0;
        runColor = color;
      } else if (color != runColor || x == W) {
        tft.drawFastHLine(runStart, y, x - runStart, runColor);
        runStart = x;
        runColor = color;
      }
    }
  }

  // Pitch ladder (shifts with pitchShift and rotates with roll)
  for (int mark = -30; mark <= 30; mark += 10) {
    if (mark == 0) continue;

    float offset = -mark * 1.65f;
    float halfWidth = (abs(mark) == 10) ? 9.0f : 14.0f;

    int x1 = CX + (int)(-halfWidth * cs - offset * sn);
    int y1 = CY + (int)(pitchShift - halfWidth * sn + offset * cs);
    int x2 = CX + (int)(halfWidth * cs - offset * sn);
    int y2 = CY + (int)(pitchShift + halfWidth * sn + offset * cs);

    if (x1 >= 1 && x1 < W - 1 && x2 >= 1 && x2 < W - 1 &&
        y1 >= 1 && y1 < H - 1 && y2 >= 1 && y2 < H - 1) {
      tft.drawLine(x1, y1, x2, y2, WHITE);
      tft.drawFastHLine(x1 - 3, y1, 3, WHITE);
      tft.drawFastHLine(x2, y2, 3, WHITE);
    }
  }

  // Bank-angle scale
  for (int deg = -60; deg <= 60; deg += 10) {
    float a = deg * PI / 180.0f;
    int x1 = CX + (int)(20 * sinf(a));
    int y1 = 27 - (int)(20 * cosf(a));
    int x2 = CX + (int)(25 * sinf(a));
    int y2 = 27 - (int)(25 * cosf(a));
    tft.drawLine(x1, y1, x2, y2, WHITE);
  }

  // Fixed yellow aircraft symbol
  tft.drawLine(CX - 24, CY, CX - 7, CY, YELLOW);
  tft.drawLine(CX + 7, CY, CX + 24, CY, YELLOW);
  tft.drawLine(CX - 7, CY, CX - 3, CY + 5, YELLOW);
  tft.drawLine(CX + 7, CY, CX + 3, CY + 5, YELLOW);
  tft.drawLine(CX - 3, CY + 5, CX + 3, CY + 5, YELLOW);

  // Fixed bank pointer
  tft.fillTriangle(CX, 1, CX - 4, 9, CX + 4, 9, YELLOW);

  // Minimal X/Y angle panel
  tft.fillRect(3, 39, 43, 25, BLACK);
  tft.setTextSize(1);
  tft.setTextColor(YELLOW);
  tft.setCursor(6, 42);
  tft.print("X ");
  tft.print(p, 1);
  tft.setCursor(6, 53);
  tft.print("Y ");
  tft.print(r, 1);
}

// ---------- SETUP ----------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_JOY_X, INPUT);
  pinMode(PIN_JOY_Y, INPUT);
  pinMode(PIN_JOY_SW, INPUT_PULLUP);
  pinMode(PIN_CAL_BTN, INPUT_PULLUP);
  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);
  analogReadResolution(12);

  Wire.begin(MPU_SDA, MPU_SCL);
  Wire.setClock(400000);

  writeMPU(0x6B, 0x00);
  delay(100);
  writeMPU(0x1C, 0x00);
  writeMPU(0x1B, 0x00);

  int16_t ax, ay, az, gx, gy, gz;
  if (!readMPU(ax, ay, az, gx, gy, gz)) {
    Serial.println("// MPU6050 not detected at 0x68");
    while (true) delay(1000);
  }

  SPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
  tft.initR(INITR_BLACKTAB);
  tft.setRotation(0);
  tft.fillScreen(BLACK);

  calibrateGyro();

  if (readMPU(ax, ay, az, gx, gy, gz)) {
    rollDeg  = atan2f((float)ay, (float)az) * 180.0f / PI;
    pitchDeg = atan2f(-(float)ax, sqrtf((float)ay * ay + (float)az * az)) * 180.0f / PI;
    calibrateCurrentPosition();
  }

  lastMicros = micros();
  lastDraw   = millis();
  lastSerial = millis();
}

// ---------- MAIN LOOP ----------
void loop() {
  uint32_t nowUs = micros();
  float dt = (nowUs - lastMicros) / 1000000.0f;
  lastMicros = nowUs;

  if (dt > 0.0f && dt < 0.1f) {
    updateAttitude(dt);
  }

  // Check GPIO Calibration Buttons (GPIO 32 Joystick SW, GPIO 27 Cal Button, or GPIO 0 ESP32 BOOT Button)
  bool calPressed = (digitalRead(PIN_CAL_BTN) == LOW) ||
                    (digitalRead(PIN_BOOT_BTN) == LOW) ||
                    (hasJoystickHardware && digitalRead(PIN_JOY_SW) == LOW);
  if (calPressed) {
    calibrateCurrentPosition();
  }

  // Stream 50Hz CSV telemetry to AeroSync Web Simulator
  if (millis() - lastSerial >= 20) {
    lastSerial = millis();
    float pOut = pitchDeg - pitchZeroOffset;
    float rOut = rollDeg  - rollZeroOffset;
    float joyX = hasJoystickHardware ? normalizeAxis(analogRead(PIN_JOY_X), joyCenterX) : 0.0f;
    float joyY = hasJoystickHardware ? normalizeAxis(analogRead(PIN_JOY_Y), joyCenterY) : 0.0f;
    int joyBtn = calPressed ? 1 : 0;

    Serial.printf("%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%d\\n",
                  pOut, rOut, yawDeg, lastAx, lastAy, lastAz, joyX, joyY, joyBtn);
  }

  // Refresh ST7735 TFT display approximately 15 times/second
  if (millis() - lastDraw >= 66) {
    lastDraw = millis();
    drawHorizon();
  }
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
