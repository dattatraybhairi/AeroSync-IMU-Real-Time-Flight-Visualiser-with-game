/**
 * ESP32 + ST7735 128x160 SPI TFT PFD + MPU6050 IMU + Analog Joystick Telemetry
 *
 * Features:
 *   1. Renders a real-time 15 FPS Full-Screen Artificial Horizon PFD on an
 *      Adafruit ST7735 128x160 SPI TFT Display (Sky/Ground, Pitch Ladder,
 *      Bank-Angle Scale, Fixed Yellow Aircraft Symbol, and X/Y Angle Panel).
 *   2. Streams synchronized 50 Hz IMU + Joystick telemetry over USB Serial
 *      (115200 baud) to the AeroSync 3D Web Flight Simulator!
 *
 * Pinout:
 *   ST7735 TFT (SPI): SCLK=18, MOSI=23, CS=5, DC=2, RST=4
 *   MPU6050 (I2C):    SDA=21, SCL=22 (Addr 0x68)
 *   Joystick (ADC1):  VRx=34, VRy=35, SW=32 (Optional; auto-detected at boot)
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

// ---------- OPTIONAL ANALOG JOYSTICK PINS ----------
#define PIN_JOY_X  34
#define PIN_JOY_Y  35
#define PIN_JOY_SW 32

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

// ---------- ADJUSTABLE OFFSETS ----------
const float X_OFFSET = 2.0f;   // Pitch offset in degrees
const float Y_OFFSET = 0.0f;   // Roll offset in degrees

// ---------- ATTITUDE & TELEMETRY ----------
float pitchDeg = 0.0f;
float rollDeg  = 0.0f;
float yawDeg   = 0.0f;
float lastAx   = 0.0f;
float lastAy   = 0.0f;
float lastAz   = 9.81f;

float gyroXBias = 0.0f;
float gyroYBias = 0.0f;
float gyroZBias = 0.0f;

int joyCenterX = 2048;
int joyCenterY = 2048;
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

// ---------- GYRO & JOYSTICK CALIBRATION ----------
void calibrateGyro() {
  int64_t sumX = 0;
  int64_t sumY = 0;
  int64_t sumZ = 0;
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

  float accelRoll =
    atan2f(y, z) * 180.0f / PI;

  float accelPitch =
    atan2f(-x, sqrtf(y * y + z * z))
    * 180.0f / PI;

  float rateX = (gx - gyroXBias) / 131.0f;
  float rateY = (gy - gyroYBias) / 131.0f;
  float rateZ = (gz - gyroZBias) / 131.0f;

  // Gyro deadband to stop stationary drift
  if (fabsf(rateX) < 0.5f) rateX = 0.0f;
  if (fabsf(rateY) < 0.5f) rateY = 0.0f;
  if (fabsf(rateZ) < 0.8f) rateZ = 0.0f;

  const float alpha = 0.96f;

  rollDeg =
    alpha * (rollDeg + rateX * dt)
    + (1.0f - alpha) * accelRoll;

  pitchDeg =
    alpha * (pitchDeg + rateY * dt)
    + (1.0f - alpha) * accelPitch;

  yawDeg += rateZ * dt;
  while (yawDeg >= 360.0f) yawDeg -= 360.0f;
  while (yawDeg < 0.0f)    yawDeg += 360.0f;
}

// ---------- FULL-SCREEN HORIZON ON ST7735 TFT ----------
void drawHorizon() {
  // Apply offsets for display only; never accumulate them.
  float p = constrain(pitchDeg + X_OFFSET, -35.0f, 35.0f);
  float r = constrain(rollDeg + Y_OFFSET, -60.0f, 60.0f);

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
        tft.drawFastHLine(
          runStart, y, x - runStart, runColor
        );
        runStart = x;
        runColor = color;
      }
    }
  }

  // Pitch ladder (moves smoothly with both pitchShift and roll angle!)
  for (int mark = -30; mark <= 30; mark += 10) {
    if (mark == 0) continue;

    float offset = -mark * 1.65f;
    float halfWidth = (abs(mark) == 10) ? 9.0f : 14.0f;

    int x1 = CX + (int)(-halfWidth * cs - offset * sn);
    int y1 = CY + (int)(pitchShift - halfWidth * sn + offset * cs);
    int x2 = CX + (int)(halfWidth * cs - offset * sn);
    int y2 = CY + (int)(pitchShift + halfWidth * sn + offset * cs);

    if (x1 >= 1 && x1 < W - 1 &&
        x2 >= 1 && x2 < W - 1 &&
        y1 >= 1 && y1 < H - 1 &&
        y2 >= 1 && y2 < H - 1) {
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
  tft.fillTriangle(
    CX, 1,
    CX - 4, 9,
    CX + 4, 9,
    YELLOW
  );

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
  analogReadResolution(12);

  Wire.begin(MPU_SDA, MPU_SCL);
  Wire.setClock(400000);

  // Wake MPU6050
  writeMPU(0x6B, 0x00);
  delay(100);

  // Accelerometer +/-2g; gyro +/-250 dps
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

  // Initial attitude estimate
  if (readMPU(ax, ay, az, gx, gy, gz)) {
    rollDeg =
      atan2f((float)ay, (float)az) * 180.0f / PI;

    pitchDeg =
      atan2f(
        -(float)ax,
        sqrtf((float)ay * ay + (float)az * az)
      ) * 180.0f / PI;
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

  // Stream 50Hz CSV telemetry to AeroSync Web Simulator
  if (millis() - lastSerial >= 20) {
    lastSerial = millis();
    float pOut = pitchDeg + X_OFFSET;
    float rOut = rollDeg + Y_OFFSET;
    float joyX = hasJoystickHardware ? normalizeAxis(analogRead(PIN_JOY_X), joyCenterX) : 0.0f;
    float joyY = hasJoystickHardware ? normalizeAxis(analogRead(PIN_JOY_Y), joyCenterY) : 0.0f;
    int joyBtn = (hasJoystickHardware && digitalRead(PIN_JOY_SW) == LOW) ? 1 : 0;

    Serial.printf("%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%d\n",
                  pOut, rOut, yawDeg, lastAx, lastAy, lastAz, joyX, joyY, joyBtn);
  }

  // Refresh ST7735 TFT display approximately 15 times/second
  if (millis() - lastDraw >= 66) {
    lastDraw = millis();
    drawHorizon();
  }
}

