#!/usr/bin/env python3
"""
mac_imu_bridge.py
macOS Python Serial-to-WebSocket Bridge for ESP32 IMU Flight Telemetry

Collects real-time pitch, roll, yaw, and acceleration values from an ESP32 connected
over USB Serial (or generates 50Hz simulated telemetry with --simulate) and broadcasts
them to web clients via WebSockets on ws://localhost:8765.

Requirements:
    pip3 install pyserial websockets

Usage:
    python3 mac_imu_bridge.py                                      # Auto-detect ESP32 USB port on Mac
    python3 mac_imu_bridge.py --port /dev/cu.usbserial-0001        # Explicit serial port
    python3 mac_imu_bridge.py /dev/cu.usbserial-0001               # Positional serial port
    python3 mac_imu_bridge.py --simulate                           # Stream 50Hz simulated IMU data over WebSocket
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
    """Auto-detects USB serial device on macOS (/dev/cu.* and /dev/tty.*)."""
    patterns = [
        "/dev/cu.usbserial*",
        "/dev/cu.SLAB_USBtoUART*",
        "/dev/cu.wchusbserial*",
        "/dev/cu.usbmodem*",
        "/dev/tty.usbserial*",
        "/dev/tty.SLAB_USBtoUART*",
        "/dev/tty.wchusbserial*",
        "/dev/tty.usbmodem*",
    ]
    detected = []
    for pat in patterns:
        detected.extend(glob.glob(pat))
    return detected[0] if detected else None


async def broadcast_serial_imu(ser):
    """Continuously reads from ESP32 serial and broadcasts to WebSocket clients."""
    loop = asyncio.get_running_loop()
    print("Reading real-time ESP32 IMU telemetry from serial...")
    while True:
        try:
            line = await loop.run_in_executor(None, ser.readline)
            decoded = line.decode("utf-8", errors="ignore").strip()
            if decoded and not decoded.startswith("//") and connected_clients:
                await asyncio.gather(
                    *[client.send(decoded) for client in connected_clients],
                    return_exceptions=True,
                )
        except Exception as e:
            print(f"Serial read error: {e}")
            await asyncio.sleep(0.1)


async def broadcast_simulated_imu():
    """Generates smooth 50Hz simulated flight moments and broadcasts over WebSocket."""
    print("Streaming 50Hz SIMULATED IMU telemetry over WebSocket...")
    t0 = time.time()
    while True:
        t = time.time() - t0
        pitch = math.sin(t * 0.9) * 18.0 + math.cos(t * 0.4) * 6.0
        roll = math.cos(t * 0.7) * 32.0 + math.sin(t * 1.3) * 8.0
        yaw = (t * 22.0) % 360.0
        ax = -math.sin(math.radians(pitch)) * 9.81
        ay = math.sin(math.radians(roll)) * math.cos(math.radians(pitch)) * 9.81
        az = math.cos(math.radians(roll)) * math.cos(math.radians(pitch)) * 9.81

        payload = f"{pitch:.2f},{roll:.2f},{yaw:.2f},{ax:.2f},{ay:.2f},{az:.2f}"
        if connected_clients:
            await asyncio.gather(
                *[client.send(payload) for client in connected_clients],
                return_exceptions=True,
            )
        await asyncio.sleep(0.02)  # 50 Hz


async def ws_handler(websocket):
    """Registers new WebSocket client connections."""
    connected_clients.add(websocket)
    print(f"Browser connected! Active clients: {len(connected_clients)}")
    try:
        await websocket.wait_closed()
    finally:
        connected_clients.discard(websocket)
        print(f"Browser disconnected. Active clients: {len(connected_clients)}")


async def main():
    parser = argparse.ArgumentParser(
        description="macOS ESP32 Serial-to-WebSocket IMU Bridge"
    )
    parser.add_argument(
        "positional_port",
        nargs="?",
        default=None,
        help="Optional positional serial port path (e.g. /dev/cu.usbserial-0001)",
    )
    parser.add_argument(
        "--port",
        "-p",
        default=None,
        help="Serial port path (e.g. /dev/cu.usbserial-0001)",
    )
    parser.add_argument(
        "--baud",
        "-b",
        type=int,
        default=DEFAULT_BAUD,
        help=f"Serial baud rate (default: {DEFAULT_BAUD})",
    )
    parser.add_argument(
        "--ws-port",
        type=int,
        default=DEFAULT_WS_PORT,
        help=f"WebSocket server port (default: {DEFAULT_WS_PORT})",
    )
    parser.add_argument(
        "--simulate",
        "-s",
        action="store_true",
        help="Run in simulation mode without physical ESP32 hardware",
    )
    args = parser.parse_args()

    server = await websockets.serve(ws_handler, "localhost", args.ws_port)
    print(f"WebSocket Server running at ws://localhost:{args.ws_port}")
    print("Open http://localhost:3000 -> IMU Source -> WebSocket (Python) -> Connect WS")

    if args.simulate:
        await broadcast_simulated_imu()
        return

    port = args.port or args.positional_port or find_esp32_port()
    if not port:
        print("\nWarning: No ESP32 USB serial port auto-detected on macOS.")
        print("To list connected USB serial ports on Mac, run: ls /dev/cu.*")
        print("Falling back to --simulate mode so you can test the WebSocket connection immediately!\n")
        await broadcast_simulated_imu()
        return

    print(f"Connecting to ESP32 on port: {port} at {args.baud} baud...")
    try:
        ser = serial.Serial(port, args.baud, timeout=1)
    except Exception as e:
        print(f"Error opening port {port}: {e}")
        print("Falling back to --simulate mode so WebSocket server stays active...")
        await broadcast_simulated_imu()
        return

    await broadcast_serial_imu(ser)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBridge stopped by user.")
