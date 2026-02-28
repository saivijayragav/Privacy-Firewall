"use client";

import React, { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ScanResponse, ManualRegion } from "@/lib/api";
import { CheckCircleIcon, EditIcon } from "./Icons";

// Set the workerSrc for PDF.js to load the worker from the public folder or absolute URL
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Props {
  file: File;
  scanResult: ScanResponse;
  onRedact: (approvedIds: string[], manualRegions: ManualRegion[]) => void;
  onCancel: () => void;
}

export function PdfRedactionEditor({ file, scanResult, onRedact, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [isLoaded, setIsLoaded] = useState(false);

  // PDF Intrinsic Dimensions vs Render Dimensions
  const [internalSize, setInternalSize] = useState<{ width: number; height: number } | null>(null);
  const [renderScale, setRenderScale] = useState<{ x: number; y: number }>({ x: 1, y: 1 });

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
    const handleResize = () => {
      if (containerRef.current && internalSize) {
        setRenderScale({
          x: containerRef.current.clientWidth / internalSize.width,
          y: (containerRef.current.clientWidth * (internalSize.height / internalSize.width)) / internalSize.height,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [internalSize]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  function onPageLoadSuccess(pageInfo: any) {
    setIsLoaded(true);
    // Grab unscaled internal PDF height/width
    const viewport = pageInfo.getViewport({ scale: 1.0 });
    setInternalSize({ width: viewport.width, height: viewport.height });

    if (containerRef.current) {
      setRenderScale({
        x: containerRef.current.clientWidth / viewport.width,
        y: (containerRef.current.clientWidth * (viewport.height / viewport.width)) / viewport.height,
      });
    }
  }

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
    if (currentRect.w > 10 && currentRect.h > 10 && renderScale.x > 0 && renderScale.y > 0) {
      // Convert back to intrinsic PDF coordinates
      const origX0 = currentRect.x / renderScale.x;
      const origY0 = currentRect.y / renderScale.y;
      const origX1 = (currentRect.x + currentRect.w) / renderScale.x;
      const origY1 = (currentRect.y + currentRect.h) / renderScale.y;

      setManualRegions((prev) => [
        ...prev,
        { bbox: [origX0, origY0, origX1, origY1], page: pageNumber, label: "Manual Region" }
      ]);
    }
    setCurrentRect(null);
    setDrawStart(null);
  };

  return (
    <div className="glass-card" style={{ padding: 24, marginTop: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <EditIcon size={20} /> Review & Redact (PDF)
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            Click existing boxes to toggle them off/on. Click and drag on the PDF to draw new redaction regions.
          </p>
        </div>
        
        {/* Basic Pagination Controls for PDFs */}
        {numPages && numPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--surface)", padding: "6px 16px", borderRadius: "100px", border: "1px solid var(--border)" }}>
             <button 
                onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                disabled={pageNumber <= 1}
                className="icon-btn"
                style={{ background: "none", border: "none", cursor: pageNumber > 1 ? "pointer" : "default", opacity: pageNumber > 1 ? 1 : 0.4 }}
             >
                ◀
             </button>
             <span style={{ fontSize: "14px", fontWeight: 600 }}>Page {pageNumber} of {numPages}</span>
             <button 
                onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                disabled={pageNumber >= numPages}
                className="icon-btn"
                style={{ background: "none", border: "none", cursor: pageNumber < numPages ? "pointer" : "default", opacity: pageNumber < numPages ? 1 : 0.4 }}
             >
                ▶
             </button>
          </div>
        )}
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
          userSelect: "none",
          backgroundColor: "#fff",
        }}
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDragStart={(e) => e.preventDefault()}
      >
        <Document file={file} onLoadSuccess={onDocumentLoadSuccess} loading={
            <div style={{ padding: "100px", textAlign: "center", color: "var(--text-secondary)" }}><span className="spinner" /> Loading PDF Document...</div>
        }>
          <Page 
             pageNumber={pageNumber} 
             onLoadSuccess={onPageLoadSuccess}
             renderTextLayer={false}
             renderAnnotationLayer={false}
             width={800} // Force a default width that scales cleanly
          />
        </Document>

        {/* Existing Scan Results (Filtered by current page) */}
        {isLoaded && renderScale.x > 0 && scanResult.flagged_entities
          .filter(fe => (fe.detected.location_reference.page || 1) === pageNumber)
          .map((fe) => {
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
                left: x0 * renderScale.x,
                top: y0 * renderScale.y,
                width: (x1 - x0) * renderScale.x,
                height: (y1 - y0) * renderScale.y,
                border: isActive ? "2px solid var(--danger)" : "2px dashed var(--text-muted)",
                backgroundColor: isActive ? "rgba(239, 68, 68, 0.2)" : "rgba(148, 163, 184, 0.1)",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-end",
                zIndex: 10
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

        {/* Manual Regions (Filtered by current page) */}
        {isLoaded && renderScale.x > 0 && manualRegions.map((mr, idx) => {
          if (mr.page !== pageNumber) return null;
          const [x0, y0, x1, y1] = mr.bbox;
          return (
            <div
              key={`manual-${idx}`}
              style={{
                position: "absolute",
                left: x0 * renderScale.x,
                top: y0 * renderScale.y,
                width: (x1 - x0) * renderScale.x,
                height: (y1 - y0) * renderScale.y,
                border: "2px solid var(--warning)",
                backgroundColor: "rgba(245, 158, 11, 0.2)",
                cursor: "default",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-end",
                zIndex: 10
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

        {/* Drawing Rectangle Preview */}
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
              pointerEvents: "none",
              zIndex: 20
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
