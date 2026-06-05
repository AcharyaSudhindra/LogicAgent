"use client";
import React, { useEffect, useRef, useState } from "react";

type Transition = { time: number; value: string };
type ParsedData = {
  timescale: string;
  transitions: Record<string, Transition[]>;
};

interface WaveformViewerProps {
  parsedData: ParsedData | null;
  errors?: { signal: string; time?: number; message: string }[];
}

export default function WaveformViewer({ parsedData, errors = [] }: WaveformViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1.0);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);

  useEffect(() => {
    if (!parsedData || !canvasRef.current || !containerRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = containerRef.current.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, rect.width, rect.height);
    
    // Draw background grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < rect.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (let y = 0; y < rect.height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

    const transitions = parsedData.transitions;
    const allSignals = Object.keys(transitions);
    if (!allSignals.length) return;

    const preferred = ["clk", "d", "q", "a", "b", "y", "rst"];
    const signals = preferred.filter(s => allSignals.includes(s)).concat(allSignals.filter(s => !preferred.includes(s)));

    let maxTime = 1;
    signals.forEach(sig => {
      const arr = transitions[sig] || [];
      if (arr.length) maxTime = Math.max(maxTime, arr[arr.length - 1].time);
    });

    const top = 30;
    const rowH = 60;
    const left = 120;
    const right = 40;
    
    const plotW = (rect.width - left - right) * scale;
    const xOf = (t: number) => left + (t / maxTime) * plotW - offset;
    
    const errSet = new Set(errors.map(e => e.signal));

    signals.forEach((sig, idx) => {
      const yBase = top + idx * rowH + 30;
      const yHigh = yBase - 24;
      const yLow = yBase;
      const hasError = errSet.has(sig);

      ctx.fillStyle = hasError ? "#ef4444" : "#94a3b8";
      ctx.font = hasError ? "bold 14px monospace" : "14px monospace";
      ctx.fillText(sig, 16, yBase - 8);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, yLow);
      ctx.lineTo(rect.width - right, yLow);
      ctx.stroke();

      const arr = transitions[sig] || [];
      if (!arr.length) return;

      const timeline = new Set([0, maxTime]);
      arr.forEach(tr => timeline.add(tr.time));
      const sortedTimes = Array.from(timeline).sort((a, b) => a - b);

      const valueAt = (t: number) => {
        let v = "x";
        for (const tr of arr) {
          if (tr.time <= t) v = tr.value;
          else break;
        }
        return v;
      };

      ctx.strokeStyle = hasError ? "#ef4444" : "#00e5ff";
      ctx.lineWidth = 2;
      ctx.shadowColor = hasError ? "rgba(239, 68, 68, 0.5)" : "rgba(0, 229, 255, 0.5)";
      ctx.shadowBlur = 10;

      for (let i = 0; i < sortedTimes.length - 1; i++) {
        const t0 = sortedTimes[i];
        const t1 = sortedTimes[i + 1];
        const v0 = valueAt(t0);
        const y0 = (v0 === "1") ? yHigh : yLow;
        const v1 = valueAt(t1);
        const y1 = (v1 === "1") ? yHigh : yLow;

        ctx.beginPath();
        ctx.moveTo(xOf(t0), y0);
        ctx.lineTo(xOf(t1), y0);
        ctx.stroke();

        if (y0 !== y1) {
          ctx.beginPath();
          ctx.moveTo(xOf(t1), y0);
          ctx.lineTo(xOf(t1), y1);
          ctx.stroke();
        }
      }
      
      ctx.shadowBlur = 0;
    });
  }, [parsedData, scale, offset, errors]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) setScale(s => Math.min(s * 1.1, 50));
    else setScale(s => Math.max(s / 1.1, 0.1));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    setOffset(o => Math.max(-500, o - dx));
    setStartX(e.clientX);
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full relative cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {parsedData ? (
        <canvas 
          ref={canvasRef} 
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-mono text-sm">
          No waveform loaded. Upload a VCD file to view the canvas plot.
        </div>
      )}
    </div>
  );
}
