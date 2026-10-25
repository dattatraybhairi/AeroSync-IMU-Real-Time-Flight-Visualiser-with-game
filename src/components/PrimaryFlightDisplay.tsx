import React, { useEffect, useRef, useState } from 'react';
import { type IMUData } from '../utils/imuMath';
import { Cpu, Monitor } from 'lucide-react';

interface PrimaryFlightDisplayProps {
  imuData: IMUData;
}

// 5x7 Adafruit_GFX standard bitmap font glyphs for ST7735 TFT text ("X", "Y", "0"-"9", "-", ".", " ")
const GFX_FONT_5X7: Record<string, number[]> = {
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00],
  '-': [0x08, 0x08, 0x08, 0x08, 0x08],
  '+': [0x08, 0x08, 0x3e, 0x08, 0x08],
  '.': [0x00, 0x60, 0x60, 0x00, 0x00],
  '0': [0x3e, 0x51, 0x49, 0x45, 0x3e],
  '1': [0x00, 0x42, 0x7f, 0x40, 0x00],
  '2': [0x42, 0x61, 0x51, 0x49, 0x46],
  '3': [0x21, 0x41, 0x45, 0x4b, 0x31],
  '4': [0x18, 0x14, 0x12, 0x7f, 0x10],
  '5': [0x27, 0x45, 0x45, 0x45, 0x39],
  '6': [0x3c, 0x4a, 0x49, 0x49, 0x30],
  '7': [0x01, 0x71, 0x09, 0x05, 0x03],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36],
  '9': [0x06, 0x49, 0x49, 0x29, 0x1e],
  X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x07, 0x08, 0x70, 0x08, 0x07],
  Z: [0x61, 0x51, 0x49, 0x45, 0x43],
};

// Exact RGB565 colors from ESP32 ST7735 code:
// SKY    = 0x351F -> R:49,  G:162, B:255
// GROUND = 0xA145 -> R:165, G:40,  B:41
// WHITE  = 0xFFFF -> R:255, G:255, B:255
// YELLOW = 0xFFE0 -> R:255, G:255, B:0
// BLACK  = 0x0000 -> R:0,   G:0,   B:0
const COLOR_SKY: [number, number, number] = [49, 162, 255];
const COLOR_GROUND: [number, number, number] = [165, 40, 41];
const COLOR_WHITE: [number, number, number] = [255, 255, 255];
const COLOR_YELLOW: [number, number, number] = [255, 255, 0];
const COLOR_BLACK: [number, number, number] = [0, 0, 0];

const TFT_W = 128;
const TFT_H = 160;
const TFT_CX = 64;
const TFT_CY = 80;

export const PrimaryFlightDisplay: React.FC<PrimaryFlightDisplayProps> = ({ imuData }) => {
  const { pitch, roll, yaw, az } = imuData;
  const [displayStyle, setDisplayStyle] = useState<'st7735' | 'glass'>('st7735');
  const [useSketchOffset, setUseSketchOffset] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render exact ST7735 128x160 SPI TFT drawHorizon() algorithm onto HTML5 canvas
  useEffect(() => {
    if (displayStyle !== 'st7735') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(TFT_W, TFT_H);
    const buf = imgData.data;

    const setPixel = (x: number, y: number, rgb: [number, number, number]) => {
      const ix = Math.trunc(x);
      const iy = Math.trunc(y);
      if (ix < 0 || ix >= TFT_W || iy < 0 || iy >= TFT_H) return;
      const idx = (iy * TFT_W + ix) * 4;
      buf[idx] = rgb[0];
      buf[idx + 1] = rgb[1];
      buf[idx + 2] = rgb[2];
      buf[idx + 3] = 255;
    };

    const drawFastHLine = (x: number, y: number, w: number, rgb: [number, number, number]) => {
      const iy = Math.trunc(y);
      if (iy < 0 || iy >= TFT_H) return;
      const startX = Math.max(0, Math.trunc(x));
      const endX = Math.min(TFT_W - 1, Math.trunc(x + w - 1));
      for (let ix = startX; ix <= endX; ix++) {
        setPixel(ix, iy, rgb);
      }
    };

    const fillRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      rgb: [number, number, number]
    ) => {
      for (let row = 0; row < h; row++) {
        drawFastHLine(x, y + row, w, rgb);
      }
    };

    // Bresenham integer line matching Adafruit_GFX::drawLine
    const drawLine = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      rgb: [number, number, number]
    ) => {
      let ix0 = Math.trunc(x0);
      let iy0 = Math.trunc(y0);
      const ix1 = Math.trunc(x1);
      const iy1 = Math.trunc(y1);
      const dx = Math.abs(ix1 - ix0);
      const sx = ix0 < ix1 ? 1 : -1;
      const dy = -Math.abs(iy1 - iy0);
      const sy = iy0 < iy1 ? 1 : -1;
      let err = dx + dy;

      while (true) {
        setPixel(ix0, iy0, rgb);
        if (ix0 === ix1 && iy0 === iy1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          ix0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          iy0 += sy;
        }
      }
    };

    const fillTriangle = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      rgb: [number, number, number]
    ) => {
      const minY = Math.max(0, Math.min(y0, y1, y2));
      const maxY = Math.min(TFT_H - 1, Math.max(y0, y1, y2));
      const minX = Math.max(0, Math.min(x0, x1, x2));
      const maxX = Math.min(TFT_W - 1, Math.max(x0, x1, x2));
      const edge = (ax: number, ay: number, bx: number, by: number, px: number, py: number) =>
        (px - ax) * (by - ay) - (py - ay) * (bx - ax);

      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const w0 = edge(x1, y1, x2, y2, px, py);
          const w1 = edge(x2, y2, x0, y0, px, py);
          const w2 = edge(x0, y0, x1, y1, px, py);
          if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
            setPixel(px, py, rgb);
          }
        }
      }
    };

    const drawGfxText = (
      cursorX: number,
      cursorY: number,
      text: string,
      rgb: [number, number, number]
    ) => {
      let cx = Math.trunc(cursorX);
      const cy = Math.trunc(cursorY);
      for (let i = 0; i < text.length; i++) {
        const ch = text[i].toUpperCase();
        const glyph = GFX_FONT_5X7[ch] || GFX_FONT_5X7[' '];
        for (let col = 0; col < 5; col++) {
          const colBits = glyph[col];
          for (let row = 0; row < 7; row++) {
            if ((colBits >> row) & 0x01) {
              setPixel(cx + col, cy + row, rgb);
            }
          }
        }
        cx += 6;
      }
    };

    // ---------- EXACT ST7735 drawHorizon() MATH ----------
    const xOffset = useSketchOffset ? 2.0 : 0.0;
    const yOffset = 0.0;

    const p = Math.max(-35.0, Math.min(35.0, pitch + xOffset));
    const r = Math.max(-60.0, Math.min(60.0, roll + yOffset));

    const angle = (r * Math.PI) / 180.0;
    const cs = Math.cos(angle);
    const sn = Math.sin(angle);
    const pitchShift = p * 1.65;

    // 1. Full-screen sky and ground scanlines
    for (let y = 0; y < TFT_H; y++) {
      const dy = y - TFT_CY - pitchShift;
      for (let x = 0; x < TFT_W; x++) {
        const dx = x - TFT_CX;
        const localY = -dx * sn + dy * cs;
        setPixel(x, y, localY < 0.0 ? COLOR_SKY : COLOR_GROUND);
      }
    }

    // 2. Pitch ladder (-30 to +30 by 10, shifting with pitchShift and rotating with roll)
    for (let mark = -30; mark <= 30; mark += 10) {
      if (mark === 0) continue;

      const offset = -mark * 1.65;
      const halfWidth = Math.abs(mark) === 10 ? 9.0 : 14.0;

      // Transform ladder rung endpoints in horizon frame so rungs move with both pitch & roll
      const x1 = TFT_CX + Math.trunc(-halfWidth * cs - offset * sn);
      const y1 = TFT_CY + Math.trunc(pitchShift - halfWidth * sn + offset * cs);
      const x2 = TFT_CX + Math.trunc(halfWidth * cs - offset * sn);
      const y2 = TFT_CY + Math.trunc(pitchShift + halfWidth * sn + offset * cs);

      if (
        x1 >= 1 &&
        x1 < TFT_W - 1 &&
        x2 >= 1 &&
        x2 < TFT_W - 1 &&
        y1 >= 1 &&
        y1 < TFT_H - 1 &&
        y2 >= 1 &&
        y2 < TFT_H - 1
      ) {
        drawLine(x1, y1, x2, y2, COLOR_WHITE);
        drawFastHLine(x1 - 3, y1, 3, COLOR_WHITE);
        drawFastHLine(x2, y2, 3, COLOR_WHITE);
      }
    }

    // 3. Bank-angle scale (-60 to +60 by 10)
    for (let deg = -60; deg <= 60; deg += 10) {
      const a = (deg * Math.PI) / 180.0;
      const x1 = TFT_CX + Math.trunc(20 * Math.sin(a));
      const y1 = 27 - Math.trunc(20 * Math.cos(a));
      const x2 = TFT_CX + Math.trunc(25 * Math.sin(a));
      const y2 = 27 - Math.trunc(25 * Math.cos(a));
      drawLine(x1, y1, x2, y2, COLOR_WHITE);
    }

    // 4. Fixed yellow aircraft symbol
    drawLine(TFT_CX - 24, TFT_CY, TFT_CX - 7, TFT_CY, COLOR_YELLOW);
    drawLine(TFT_CX + 7, TFT_CY, TFT_CX + 24, TFT_CY, COLOR_YELLOW);
    drawLine(TFT_CX - 7, TFT_CY, TFT_CX - 3, TFT_CY + 5, COLOR_YELLOW);
    drawLine(TFT_CX + 7, TFT_CY, TFT_CX + 3, TFT_CY + 5, COLOR_YELLOW);
    drawLine(TFT_CX - 3, TFT_CY + 5, TFT_CX + 3, TFT_CY + 5, COLOR_YELLOW);

    // 5. Fixed yellow bank pointer triangle at top center (rotates slightly or stays fixed as reference)
    fillTriangle(TFT_CX, 1, TFT_CX - 4, 9, TFT_CX + 4, 9, COLOR_YELLOW);

    // 6. Minimal X/Y angle panel at (3, 39, 43, 25)
    fillRect(3, 39, 43, 25, COLOR_BLACK);
    drawGfxText(6, 42, `X ${p.toFixed(1)}`, COLOR_YELLOW);
    drawGfxText(6, 53, `Y ${r.toFixed(1)}`, COLOR_YELLOW);

    ctx.putImageData(imgData, 0, 0);
  }, [pitch, roll, displayStyle, useSketchOffset]);

  // Pitch ladder vertical shift for Glass mode: ~1.8 pixels per degree of pitch
  const pitchOffsetPx = Math.max(-60, Math.min(60, pitch * 1.8));

  const getHeadingCompassLabel = (heading: number) => {
    const h = ((heading % 360) + 360) % 360;
    if (h >= 337.5 || h < 22.5) return 'N';
    if (h >= 22.5 && h < 67.5) return 'NE';
    if (h >= 67.5 && h < 112.5) return 'E';
    if (h >= 112.5 && h < 157.5) return 'SE';
    if (h >= 157.5 && h < 202.5) return 'S';
    if (h >= 202.5 && h < 247.5) return 'SW';
    if (h >= 247.5 && h < 292.5) return 'W';
    return 'NW';
  };

  const gForce = az ? (az / 9.81).toFixed(2) : '1.00';

  return (
    <div className="flex flex-col bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-md p-2.5 select-none w-full transition-colors">
      {/* Top Header with ST7735 TFT / Glass Mode Toggle */}
      <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 tracking-wider">
            {displayStyle === 'st7735' ? 'ST7735 TFT (128×160)' : 'PRIMARY ATTITUDE'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDisplayStyle(displayStyle === 'st7735' ? 'glass' : 'st7735')}
            title="Switch between ST7735 128x160 SPI TFT Display and Modern Glass PFD"
            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sky-700 dark:text-sky-300 rounded border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors"
          >
            {displayStyle === 'st7735' ? (
              <>
                <Monitor className="w-2.5 h-2.5" />
                <span>Glass</span>
              </>
            ) : (
              <>
                <Cpu className="w-2.5 h-2.5" />
                <span>ST7735</span>
              </>
            )}
          </button>
          <span className="text-[10px] font-mono font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200/60 dark:border-amber-800/60">
            {gForce}G
          </span>
        </div>
      </div>

      {displayStyle === 'st7735' ? (
        /* Authentic ST7735 1.8" 128x160 SPI TFT Hardware Breakout Module */
        <div className="flex flex-col items-center bg-rose-950/90 dark:bg-slate-950 border-2 border-rose-800/80 dark:border-slate-800 rounded-lg p-2 shadow-inner">
          {/* Top SPI Pin Header Silkscreen */}
          <div className="w-full flex items-center justify-between text-[8px] font-mono text-amber-300/90 pb-1 px-1">
            <span>SCLK:18 MOSI:23</span>
            <span className="text-white/80 font-bold">INITR_BLACKTAB</span>
            <span>CS:5 DC:2 RST:4</span>
          </div>

          {/* 128x160 Pixel-Exact TFT LCD Screen */}
          <div className="relative bg-black p-1 rounded border border-slate-700 shadow-md">
            <canvas
              ref={canvasRef}
              width={TFT_W}
              height={TFT_H}
              data-testid="st7735-tft-canvas"
              className="w-[144px] h-[180px] block [image-rendering:pixelated]"
            />
          </div>

          {/* Bottom PCB Silkscreen & X_OFFSET Toggle */}
          <div className="w-full flex items-center justify-between pt-1.5 px-1 text-[9px] font-mono text-slate-300">
            <span>MPU6050 0x68 (21/22)</span>
            <button
              type="button"
              onClick={() => setUseSketchOffset((v) => !v)}
              className={`px-1.5 py-0.2 rounded text-[8px] border cursor-pointer ${
                useSketchOffset
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title="Toggle X_OFFSET = +2.0° from Arduino sketch"
            >
              X_OFF:{useSketchOffset ? '+2.0°' : '0.0°'}
            </button>
          </div>
        </div>
      ) : (
        /* Modern Avionics Artificial Horizon Sphere / Gauge */
        <div className="relative w-full h-36 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-900 shadow-inner flex items-center justify-center">
          {/* Rotating & Translating Horizon Disk */}
          <div
            className="absolute w-[220%] h-[220%] transition-transform duration-75 will-change-transform pointer-events-none"
            style={{
              transform: `rotate(${-roll}deg) translateY(${pitchOffsetPx}px)`,
            }}
          >
            {/* Sky (Top Half) */}
            <div className="w-full h-1/2 bg-gradient-to-b from-sky-600 to-sky-400" />
            {/* Ground (Bottom Half) */}
            <div className="w-full h-1/2 bg-gradient-to-t from-amber-950 to-amber-700" />

            {/* White Horizon Line */}
            <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-[2px] bg-white shadow-xs flex items-center justify-between px-6">
              <span className="text-[9px] font-mono text-white/90 font-bold">0°</span>
              <span className="text-[9px] font-mono text-white/90 font-bold">0°</span>
            </div>

            {/* Pitch Ladder Rungs */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[36px] flex items-center gap-1.5">
              <span className="text-[8px] font-mono font-bold text-white">20</span>
              <div className="w-12 h-[2px] bg-white/90" />
              <span className="text-[8px] font-mono font-bold text-white">20</span>
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[18px] flex items-center gap-1.5">
              <span className="text-[8px] font-mono font-bold text-white">10</span>
              <div className="w-16 h-[2px] bg-white/90" />
              <span className="text-[8px] font-mono font-bold text-white">10</span>
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-[18px] flex items-center gap-1.5">
              <span className="text-[8px] font-mono font-bold text-white/80">10</span>
              <div className="w-16 h-[2px] bg-white/70 border-t border-dashed border-white" />
              <span className="text-[8px] font-mono font-bold text-white/80">10</span>
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-[36px] flex items-center gap-1.5">
              <span className="text-[8px] font-mono font-bold text-white/80">20</span>
              <div className="w-12 h-[2px] bg-white/70 border-t border-dashed border-white" />
              <span className="text-[8px] font-mono font-bold text-white/80">20</span>
            </div>
          </div>

          {/* Fixed Center Aircraft Reticle */}
          <div className="absolute z-10 flex items-center justify-center pointer-events-none">
            <div className="w-7 h-1 bg-amber-400 border border-black/60 shadow-xs" />
            <div className="w-1 h-2.5 bg-amber-400 border border-black/60" />
            <div className="w-2 h-2 mx-2 rounded-full bg-amber-400 border-2 border-black/80" />
            <div className="w-1 h-2.5 bg-amber-400 border border-black/60" />
            <div className="w-7 h-1 bg-amber-400 border border-black/60 shadow-xs" />
          </div>

          {/* Top Roll Indicator Pointer */}
          <div className="absolute top-1 left-0 right-0 flex justify-center pointer-events-none">
            <div
              className="w-2.5 h-2.5 border-l-3 border-r-3 border-b-5 border-transparent border-b-amber-400"
              style={{ transform: `rotate(${-roll}deg)` }}
            />
          </div>
        </div>
      )}

      {/* Digital Values Strip */}
      <div className="grid grid-cols-3 gap-1.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center font-mono">
        <div className="bg-slate-50 dark:bg-slate-800/80 p-1 rounded border border-slate-200/80 dark:border-slate-700">
          <div className="text-[9px] font-sans font-semibold text-slate-500 dark:text-slate-400 uppercase">
            Pitch (X)
          </div>
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {pitch >= 0 ? `+${pitch.toFixed(1)}` : pitch.toFixed(1)}°
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/80 p-1 rounded border border-slate-200/80 dark:border-slate-700">
          <div className="text-[9px] font-sans font-semibold text-slate-500 dark:text-slate-400 uppercase">
            Roll (Y)
          </div>
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {roll >= 0 ? `+${roll.toFixed(1)}` : roll.toFixed(1)}°
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/80 p-1 rounded border border-slate-200/80 dark:border-slate-700">
          <div className="text-[9px] font-sans font-semibold text-slate-500 dark:text-slate-400 uppercase">
            Yaw / Hdg
          </div>
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {Math.round(yaw).toString().padStart(3, '0')}° {getHeadingCompassLabel(yaw)}
          </div>
        </div>
      </div>
    </div>
  );
};

