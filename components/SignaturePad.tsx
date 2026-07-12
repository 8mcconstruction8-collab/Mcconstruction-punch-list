"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";
import type { Timestamp } from "firebase/firestore";

type Props = {
  label: string;
  savedImage?: string;
  savedName?: string;
  savedAt?: Timestamp;
  canEdit: boolean;
  onSave: (dataUrl: string, name: string) => Promise<void>;
};

export default function SignaturePad({
  label,
  savedImage,
  savedName,
  savedAt,
  canEdit,
  onSave
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const [name, setName] = useState(savedName || "");
  const [editing, setEditing] = useState(!savedImage);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditing(!savedImage);
    setName(savedName || "");
  }, [savedImage, savedName]);

  function getContext() {
    return canvasRef.current?.getContext("2d") || null;
  }

  function pointerPos(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
    hasDrawn.current = true;
  }

  function handlePointerUp() {
    drawing.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn.current) {
      alert("Draw your signature first.");
      return;
    }
    if (!name.trim()) {
      alert("Type your full name.");
      return;
    }
    setSaving(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      await onSave(dataUrl, name.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing && savedImage) {
    return (
      <div className="stack signature-block">
        <p className="photo-label">{label}</p>
        <img src={savedImage} alt={label} className="signature-image" />
        <p className="small" style={{ margin: 0 }}>
          {savedName}
          {savedAt ? ` — ${savedAt.toDate().toLocaleDateString()}` : ""}
        </p>
        {canEdit && (
          <button
            className="btn btn-secondary no-print"
            type="button"
            onClick={() => setEditing(true)}
          >
            Sign again
          </button>
        )}
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="stack signature-block">
        <p className="photo-label">{label}</p>
        <div className="signature-canvas signature-empty">Awaiting signature</div>
      </div>
    );
  }

  return (
    <div className="stack signature-block">
      <p className="photo-label">{label}</p>
      <canvas
        ref={canvasRef}
        width={320}
        height={140}
        className="signature-canvas"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <label style={{ margin: 0 }}>
        Full name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Type full name"
        />
      </label>
      <div className="row no-print">
        <button className="btn btn-secondary" type="button" onClick={clearCanvas}>
          Clear
        </button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save signature"}
        </button>
      </div>
    </div>
  );
}
