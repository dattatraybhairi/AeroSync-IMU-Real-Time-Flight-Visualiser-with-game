/**
 * ESP32 + Bosch BNO055 9-DOF IMU + Dual-Axis Analog Joystick Custom Flight Remote
 * 
 * Hardware Wiring:
 *   ESP32 Pin      BNO055 Pin            Analog Joystick (KY-023)
 *   ------------------------------------------------------------
 *   3V3     -----> VIN           -----> +5V / VCC (3.3V)
 *   GND     -----> GND           -----> GND
 *   GPIO 21 -----> SDA
 *   GPIO 22 -----> SCL
 *   GPIO 34 -----> (ADC1_CH6)    -----> VRx (Left / Right)
 *   GPIO 35 -----> (ADC1_CH7)    -----> VRy (Forward / Backward)
 *   GPIO 32 -----> (Pull-Up)     -----> SW  (Push Button)
 */

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BNO055.h>
#include <utility/imumaths.h>

Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28, &Wire);

const int PIN_JOY_X  = 34;
const int PIN_JOY_Y  = 35;
const int PIN_JOY_SW = 32;
int joyCenterX = 2048;
int joyCenterY = 2048;

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

  Wire.begin(21, 22, 400000);

  if (!bno.begin()) {
    Serial.println("// ERROR: BNO055 not detected. Check I2C address and wiring!");
    while (1) delay(500);
  }

  delay(200);
  bno.setExtCrystalUse(true);
  joyCenterX = analogRead(PIN_JOY_X);
  joyCenterY = analogRead(PIN_JOY_Y);
  Serial.println("// BNO055 + Analog Joystick streaming 9-DOF flight remote telemetry...");
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

  // Transmit CSV: pitch,roll,yaw,ax,ay,az,joyX,joyY,joyBtn
  Serial.printf("%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%d\n",
                pitch, roll, yaw, acc.x(), acc.y(), acc.z(), joyX, joyY, joyBtn);

  delay(20); // 50 Hz
}
