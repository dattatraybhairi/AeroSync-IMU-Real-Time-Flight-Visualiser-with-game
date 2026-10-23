import React, { useEffect, useRef } from 'react';
import { type IMUData } from '../utils/imuMath';

interface TelemetryScopeProps {
  imuData: IMUData;
  packetRate: number;
  darkMode?: boolean;
}

export const TelemetryScope: React.FC<TelemetryScopeProps> = ({
  imuData,
  packetRate,
  darkMode = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<{ time: number; pitch: number; roll: number; yaw: number }[]>([]);
  const darkRef = useRef(darkMode);
  darkRef.current = darkMode;

  // Append new data to circular history buffer
  useEffect(() => {
    const history = historyRef.current;
    history.push({
      time: Date.now(),
      pitch: imuData.pitch,
      roll: imuData.roll,
      yaw: imuData.yaw,
    });
    if (history.length > 150) {
      history.shift();
    }
  }, [imuData]);

  // Render rolling chart on 2D canvas
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const history = historyRef.current;
      const isDark = darkRef.current;

      // Background
      ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = isDark ? '#1e293b' : '#f1f5f9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 15; y < h; y += 20) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // Zero baseline
      const midY = h / 2;
      ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();

      if (history.length < 2) {
        animId = requestAnimationFrame(render);
        return;
      }

      const step = w / 150;
      const startX = w - history.length * step;
      const scaleY = (midY * 0.8) / 90;

      // Draw Pitch line (Red)
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      history.forEach((pt, i) => {
        const x = startX + i * step;
        const y = midY - pt.pitch * scaleY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Draw Roll line (Sky Blue)
      ctx.strokeStyle = isDark ? '#38bdf8' : '#0284c7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      history.forEach((pt, i) => {
        const x = startX + i * step;
        const y = midY - pt.roll * scaleY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="flex flex-col bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 shadow-sm select-none transition-colors">
      <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-800 dark:text-slate-100">REAL-TIME MOMENTS SCOPE</span>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-red-500 font-medium">● Pitch</span>
            <span className="text-sky-600 dark:text-sky-400 font-medium">● Roll</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
          <span>
            Rate: <strong className="text-slate-800 dark:text-slate-200">{packetRate} Hz</strong>
          </span>
          <span>·</span>
          <span>Range: ±90°</span>
        </div>
      </div>

      <div className="w-full h-20 rounded border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
        <canvas
          ref={canvasRef}
          width={360}
          height={80}
          className="w-full h-full block"
        />
      </div>
    </div>
  );
};
