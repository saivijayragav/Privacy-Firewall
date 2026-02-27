"use client";

import React, { useState, useEffect, useRef } from "react";
import { ScanResponse, ManualRegion } from "@/lib/api";
import { CheckCircleIcon, EditIcon } from "./Icons";

interface Props {
  file: File;
  scanResult: ScanResponse;
  onRedact: (approvedIds: string[], manualRegions: ManualRegion[]) => void;
  onCancel: () => void;
}

export function ImageRedactionEditor({ file, scanResult, onRedact, onCancel }: Props) {
  const [imageUrl, setImageUrl] = useState<string>("");
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // States for scaling
  const [scale, setScale] = useState<{ x: number; y: number }>({ x: 1, y: 1 });
  const [isLoaded, setIsLoaded] = useState(false);

  // Redaction regions
  const [approvedIds, setApprovedIds] = useState<Set<string>>(
    new Set(scanResult.flagged_entities.map((e) => e.detected.entity_id))
  );
  const [manualRegions, setManualRegions] = useState<ManualRegion[]>([]);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const handleResize = () => {
      if (imgRef.current && isLoaded) {
        setScale({
          x: imgRef.current.width / imgRef.current.naturalWidth,
          y: imgRef.current.height / imgRef.current.naturalHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isLoaded]);

  const handleImageLoad = () => {
    setIsLoaded(true);
    if (imgRef.current) {
      setScale({
        x: imgRef.current.width / imgRef.current.naturalWidth,
        y: imgRef.current.height / imgRef.current.naturalHeight,
      });
    }
  };

  const toggleEntity = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newApproved = new Set(approvedIds);
    if (newApproved.has(id)) {
      newApproved.delete(id);
    } else {
      newApproved.add(id);
    }
    setApprovedIds(newApproved);
  };

  const removeManualRegion = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setManualRegions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    setDrawStart({ x, y });
    setCurrentRect({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const x = Math.min(drawStart.x, currentX);
    const y = Math.min(drawStart.y, currentY);
    const w = Math.abs(currentX - drawStart.x);
    const h = Math.abs(currentY - drawStart.y);

    setCurrentRect({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentRect) return;
    setIsDrawing(false);
    
    // Only add if it's large enough (prevent accidental clicks)
    if (currentRect.w > 10 && currentRect.h > 10 && scale.x > 0 && scale.y > 0) {
      // Convert back to image natural coordinates
      const origX0 = currentRect.x / scale.x;
      const origY0 = currentRect.y / scale.y;
      const origX1 = (currentRect.x + currentRect.w) / scale.x;
      const origY1 = (currentRect.y + currentRect.h) / scale.y;
      
      setManualRegions((prev) => [
        ...prev,
        { bbox: [origX0, origY0, origX1, origY1], page: 1, label: "Manual Region" }
      ]);
    }
    setCurrentRect(null);
    setDrawStart(null);
  };

  return (
    <div className="glass-card" style={{ padding: 24, marginTop: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <EditIcon size={20} /> Review & Redact
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          Click existing boxes to toggle them off/on. Click and drag on the image to draw new redaction regions.
        </p>
      </div>

      <div 
        style={{ 
          position: "relative", 
          display: "inline-block",
          alignSelf: "center",
          maxWidth: "100%",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          cursor: isDrawing ? "crosshair" : "default",
          userSelect: "none"
        }}
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDragStart={(e) => e.preventDefault()}
      >
        {imageUrl && (
          <img 
            ref={imgRef}
            src={imageUrl} 
            alt="Preview" 
            style={{ display: "block", maxWidth: "100%", height: "auto", maxHeight: "600px", pointerEvents: "none" }} 
            onLoad={handleImageLoad}
          />
        )}

        {isLoaded && scale.x > 0 && scanResult.flagged_entities.map((fe) => {
          const bbox = fe.detected.location_reference.bbox;
          if (!bbox || bbox.length < 4) return null;
          const [x0, y0, x1, y1] = bbox;
          
          const isActive = approvedIds.has(fe.detected.entity_id);
          
          return (
            <div
              key={fe.detected.entity_id}
              onClick={(e) => toggleEntity(fe.detected.entity_id, e)}
              style={{
                position: "absolute",
                left: x0 * scale.x,
                top: y0 * scale.y,
                width: (x1 - x0) * scale.x,
                height: (y1 - y0) * scale.y,
                border: isActive ? "2px solid var(--danger)" : "2px dashed var(--text-muted)",
                backgroundColor: isActive ? "rgba(239, 68, 68, 0.2)" : "rgba(148, 163, 184, 0.1)",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-end"
              }}
              title={isActive ? "Click to ignore" : "Click to redact"}
            >
              <div style={{
                background: isActive ? "var(--danger)" : "var(--text-muted)",
                color: "#fff",
                fontSize: 10,
                padding: "2px 6px",
                fontWeight: 600,
                borderBottomLeftRadius: 4,
                textTransform: "capitalize"
              }}>
                {fe.detected.type.replace(/_/g, " ")} {isActive ? "✓" : "✕"}
              </div>
            </div>
          );
        })}

        {isLoaded && scale.x > 0 && manualRegions.map((mr, idx) => {
          const [x0, y0, x1, y1] = mr.bbox;
          return (
            <div
              key={`manual-${idx}`}
              style={{
                position: "absolute",
                left: x0 * scale.x,
                top: y0 * scale.y,
                width: (x1 - x0) * scale.x,
                height: (y1 - y0) * scale.y,
                border: "2px solid var(--warning)",
                backgroundColor: "rgba(245, 158, 11, 0.2)",
                cursor: "default",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-end"
              }}
            >
              <button
                onClick={(e) => removeManualRegion(idx, e)}
                style={{
                  background: "var(--warning)",
                  border: "none",
                  color: "#fff",
                  fontSize: 10,
                  padding: "2px 6px",
                  fontWeight: 600,
                  cursor: "pointer",
                  borderBottomLeftRadius: 4,
                }}
                title="Remove manual region"
              >
                Manual ✕
              </button>
            </div>
          );
        })}

        {isDrawing && currentRect && (
          <div
            style={{
              position: "absolute",
              left: currentRect.x,
              top: currentRect.y,
              width: currentRect.w,
              height: currentRect.h,
              border: "2px solid var(--warning)",
              backgroundColor: "rgba(245, 158, 11, 0.2)",
              pointerEvents: "none"
            }}
          />
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => onRedact(Array.from(approvedIds), manualRegions)}>
          <CheckCircleIcon size={16} /> Confirm & Redact
        </button>
      </div>
    </div>
  );
}
