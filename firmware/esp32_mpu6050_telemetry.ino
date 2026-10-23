/**
 * ESP32 + MPU6050 IMU + Dual-Axis Analog Joystick (KY-023) Custom Flight Remote Firmware
 * 
 * Hardware Wiring:
 *   ESP32 Pin      MPU-6050 Pin         Analog Joystick (KY-023)
 *   ------------------------------------------------------------
 *   3V3     -----> VCC           -----> +5V / VCC (Use 3.3V for 3.3V ADC range!)
 *   GND     -----> GND           -----> GND
 *   GPIO 21 -----> SDA
 *   GPIO 22 -----> SCL
 *   GPIO 34 (ADC1_CH6)           -----> VRx (Left / Right Steering & Strafe)
 *   GPIO 35 (ADC1_CH7)           -----> VRy (Forward / Backward Thrust)
 *   GPIO 32 (Internal Pull-Up)   -----> SW  (Push Button: Boost / Reset)
 * 
 * Serial Output Format (50Hz at 115200 baud):
 *   CSV: pitch,roll,yaw,ax,ay,az,joyX,joyY,joyBtn
 *   where joyX and joyY are normalized [-1.00 to +1.00]
 */

#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

Adafruit_MPU6050 mpu;

// Analog Joystick Pins (Use ADC1 pins GPIO 32-39 so Wi-Fi/BT never conflicts)
const int PIN_JOY_X   = 34; // VRx: Left (-1.0) / Right (+1.0)
const int PIN_JOY_Y   = 35; // VRy: Backward (-1.0) / Forward (+1.0)
const int PIN_JOY_SW  = 32; // SW: Push button (Active LOW)

// Telemetry State
float pitch = 0.0;
float roll  = 0.0;
float yaw   = 0.0;

// Calibration zero offsets
float accOffsetX = 0.0, accOffsetY = 0.0, accOffsetZ = 0.0;
float gyroOffsetX = 0.0, gyroOffsetY = 0.0, gyroOffsetZ = 0.0;
int joyCenterX = 2048;
int joyCenterY = 2048;
bool hasJoystickHardware = true;

unsigned long prevTime = 0;
const int CALIBRATION_SAMPLES = 250;

float normalizeAxis(int rawAdc, int center) {
  float norm = 0.0;
  if (rawAdc >= center) {
    norm = (float)(rawAdc - center) / (float)max(1, 4095 - center);
  } else {
    norm = -(float)(center - rawAdc) / (float)max(1, center);
  }
  norm = constrain(norm, -1.0, 1.0);
  if (abs(norm) < 0.12) return 0.0; // Deadzone filter
  return norm;
}

void calibrateSensors() {
  Serial.println("// Calibrating MPU6050 + Joystick Center... Keep remote flat and release thumbstick");
  float axSum = 0, aySum = 0, azSum = 0;
  float gxSum = 0, gySum = 0, gzSum = 0;
  long jxSum = 0, jySum = 0;
  int jxMin = 4095, jxMax = 0;

  for (int i = 0; i < CALIBRATION_SAMPLES; i++) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    axSum += a.acceleration.x;
    aySum += a.acceleration.y;
    azSum += a.acceleration.z - 9.81;

    gxSum += g.gyro.x;
    gySum += g.gyro.y;
    gzSum += g.gyro.z;

    int rx = analogRead(PIN_JOY_X);
    int ry = analogRead(PIN_JOY_Y);
    jxSum += rx;
    jySum += ry;
    if (rx < jxMin) jxMin = rx;
    if (rx > jxMax) jxMax = rx;

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

  // Verify a real potentiometer is wired (center within 1000..3100 and stable at rest)
  hasJoystickHardware = (joyCenterX > 1000 && joyCenterX < 3100 &&
                         joyCenterY > 1000 && joyCenterY < 3100 &&
                         (jxMax - jxMin) < 180);

  Serial.println("// Calibration complete. Streaming IMU + Joystick flight telemetry...");
}

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  pinMode(PIN_JOY_X, INPUT);
  pinMode(PIN_JOY_Y, INPUT);
  pinMode(PIN_JOY_SW, INPUT_PULLUP);
  analogReadResolution(12); // 0..4095

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

  // Gyroscope deadband to eliminate continuous stationary yaw/attitude drift
  if (abs(gx) < 0.6) gx = 0.0;
  if (abs(gy) < 0.6) gy = 0.0;
  if (abs(gz) < 0.8) gz = 0.0;

  float accPitch = atan2(-ax, sqrt(ay * ay + az * az)) * 180.0 / PI;
  float accRoll  = atan2(ay, az) * 180.0 / PI;

  // Complementary Filter (97% Gyro + 3% Accel)
  pitch = 0.97 * (pitch + gy * dt) + 0.03 * accPitch;
  roll  = 0.97 * (roll  + gx * dt) + 0.03 * accRoll;
  yaw   += gz * dt;

  // Read Dual-Axis Analog Joystick (or 0.0 if floating/unconnected)
  float joyX = hasJoystickHardware ? normalizeAxis(analogRead(PIN_JOY_X), joyCenterX) : 0.0;
  float joyY = hasJoystickHardware ? normalizeAxis(analogRead(PIN_JOY_Y), joyCenterY) : 0.0;
  int joyBtn = (hasJoystickHardware && digitalRead(PIN_JOY_SW) == LOW) ? 1 : 0;

  while (yaw >= 360.0) yaw -= 360.0;
  while (yaw < 0.0)    yaw += 360.0;

  // Output CSV: pitch,roll,yaw,ax,ay,az,joyX,joyY,joyBtn
  Serial.printf("%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%d\n",
                pitch, roll, yaw, ax, ay, az, joyX, joyY, joyBtn);

  delay(20); // 50 Hz
}
