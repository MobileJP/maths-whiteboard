"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

interface Stroke {
  points: StrokePoint[];
  tool: "pen" | "eraser";
}

export interface WhiteboardHandle {
  /** Downscaled PNG data URL on a white background, long edge ~maxLongEdge. RFD §10.3. */
  exportPNG: (maxLongEdge?: number) => string;
  clear: () => void;
  isEmpty: () => boolean;
}

const PEN_WIDTH = 2.5;
const ERASER_WIDTH = 22;

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = "#1e293b";

  const baseWidth = stroke.tool === "eraser" ? ERASER_WIDTH : PEN_WIDTH;
  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    ctx.beginPath();
    ctx.lineWidth = baseWidth * Math.max(p.pressure, 0.5);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
    ctx.restore();
    return;
  }
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1];
    const b = stroke.points[i];
    ctx.beginPath();
    ctx.lineWidth = baseWidth * Math.max((a.pressure + b.pressure) / 2, 0.5);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

// RFD §10.3: Pointer Events (not touch), pen pressure, palm rejection, devicePixelRatio
// scaling, strokes stored as vectors (not a bitmap) so undo/redo and replay are trivial.
export const Whiteboard = forwardRef<WhiteboardHandle, { className?: string }>(function Whiteboard(
  { className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0 });

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [expanded, setExpanded] = useState(false);

  const activeStrokeRef = useRef<Stroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const hasSeenPenRef = useRef(false);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const stroke of strokes) drawStroke(ctx, stroke);
  }, [strokes]);

  // Backing store sized by devicePixelRatio so strokes stay crisp on Retina/iPad displays.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: width, clientHeight: height } = container;
      if (width === 0 || height === 0) return;
      sizeRef.current = { width, height };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      redrawAll();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [redrawAll]);

  useEffect(() => {
    redrawAll();
  }, [redrawAll]);

  const pointInCanvas = (e: ReactPointerEvent<HTMLCanvasElement>): StrokePoint => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  };

  // Palm rejection: once a stylus has been seen, touch input stops drawing for the rest
  // of the session. Mouse always allowed (desktop/dev use). RFD §10.3.
  const isAllowedInput = (pointerType: string) =>
    pointerType === "mouse" || pointerType === "pen" || (pointerType === "touch" && !hasSeenPenRef.current);

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "pen") hasSeenPenRef.current = true;
    if (!isAllowedInput(e.pointerType)) return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;
    activeStrokeRef.current = { points: [pointInCanvas(e)], tool };
    setRedoStack([]);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== e.pointerId || !activeStrokeRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const point: StrokePoint = {
        x: ev.clientX - rect.left,
        y: ev.clientY - rect.top,
        pressure: ev.pressure > 0 ? ev.pressure : 0.5,
      };
      const stroke = activeStrokeRef.current;
      const prev = stroke.points[stroke.points.length - 1];
      stroke.points.push(point);
      // Draw incrementally during the stroke — cheap and avoids a full redraw per move.
      drawStroke(ctx, { tool: stroke.tool, points: [prev, point] });
    }
  };

  const endStroke = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    if (stroke && stroke.points.length > 0) {
      setStrokes((prev) => [...prev, stroke]);
    }
  };

  const undo = () => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setStrokes((s) => [...s, last]);
      return prev.slice(0, -1);
    });
  };

  const clear = useCallback(() => {
    setStrokes([]);
    setRedoStack([]);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      clear,
      isEmpty: () => strokes.length === 0,
      exportPNG: (maxLongEdge = 1568) => {
        const canvas = canvasRef.current;
        if (!canvas) return "";
        const { width, height } = sizeRef.current;
        const longEdge = Math.max(width, height) || 1;
        const scale = Math.min(1, maxLongEdge / longEdge);
        const outW = Math.max(1, Math.round(width * scale));
        const outH = Math.max(1, Math.round(height * scale));

        const out = document.createElement("canvas");
        out.width = outW;
        out.height = outH;
        const ctx = out.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(canvas, 0, 0, outW, outH);
        return out.toDataURL("image/png");
      },
    }),
    [clear, strokes],
  );

  return (
    <>
      {/* Backdrop only exists in expanded mode; tapping it collapses back, same as Done. */}
      {expanded && (
        <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={() => setExpanded(false)} />
      )}
      <div
        className={
          expanded
            ? "fixed inset-3 z-50 flex flex-col rounded-lg border border-slate-300 bg-white p-3 shadow-2xl sm:inset-10"
            : `min-w-0 ${className ?? ""}`
        }
      >
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            className={`rounded-md border px-3 py-1 text-sm ${tool === "pen" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
            onClick={() => setTool("pen")}
          >
            ✏️ Pen
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-1 text-sm ${tool === "eraser" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
            onClick={() => setTool("eraser")}
          >
            ⌫ Eraser
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
            onClick={undo}
            disabled={strokes.length === 0}
          >
            ↶ Undo
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
            onClick={redo}
            disabled={redoStack.length === 0}
          >
            ↷ Redo
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
            onClick={clear}
            disabled={strokes.length === 0}
          >
            🗑 Clear
          </button>
          <button
            type="button"
            className="ml-auto rounded-md border border-slate-300 px-3 py-1 text-sm"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "✕ Done" : "⤢ More space"}
          </button>
        </div>
        {/* Strokes are stored as vectors in container-relative pixels (RFD §10.3), so toggling
            between the inline and expanded sizes never distorts existing work — it just changes
            how much of the canvas is visible/available, the ResizeObserver in the effect above
            picks up the container size change and re-renders at it. */}
        <div
          ref={containerRef}
          className={`w-full min-w-0 overflow-hidden rounded-md border border-slate-300 bg-white ${expanded ? "flex-1" : "h-72 sm:h-[28rem]"}`}
          style={{ touchAction: "none" }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            style={{ touchAction: "none", display: "block", width: "100%", height: "100%" }}
          />
        </div>
      </div>
    </>
  );
});
