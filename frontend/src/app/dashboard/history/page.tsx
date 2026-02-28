"use client";

import { type ProcessingResponse } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  ImageIcon,
  MusicIcon,
  FileTextIcon,
  ClipboardIcon,
  TrashIcon,
  AlertTriangleIcon,
  ArrowLeftIcon,
} from "@/components/Icons";

interface HistoryItem {
  id: number;
  fileName: string;
  fileSize: number;
  mediaType: string;
  mode: string;
  riskScore: number;
  entityCount: number;
  timestamp: string;
  result: ProcessingResponse;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function severityColor(score: number): string {
  if (score >= 0.7) return "var(--danger)";
  if (score >= 0.4) return "var(--warning)";
  return "var(--success)";
}

function mediaIcon(type: string): React.ReactNode {
  if (type === "image") return <ImageIcon size={28} color="var(--accent)" />;
  if (type === "audio") return <MusicIcon size={28} color="var(--accent)" />;
  return <FileTextIcon size={28} color="var(--accent)" />;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState<HistoryItem | null>(null);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("scan_history") || "[]");
    setHistory(stored);
  }, []);

  function clearHistory() {
    localStorage.removeItem("scan_history");
    setHistory([]);
    setSelected(null);
  }

  return (
    <div>
      {/* Hero Header with Grid Background */}
      <div style={{
        position: "relative",
        padding: "32px 0 40px",
        marginBottom: "32px",
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: "16px"
      }}>
        {/* Faint Grid lines spanning the container */}
        <div style={{
          position: "absolute",
          top: 0, left: "-32px", right: "-32px", bottom: 0,
          backgroundImage: "linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          pointerEvents: "none",
          zIndex: 0
        }} />
        
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ 
            color: "var(--accent-secondary)", 
            fontSize: "12px", 
            fontWeight: 700, 
            letterSpacing: "0.15em", 
            textTransform: "uppercase",
            marginBottom: "8px",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <span>//</span> LOGS & REPORTS
          </div>
          <h2 style={{ 
            fontSize: "42px", 
            fontWeight: 800, 
            letterSpacing: "-0.02em", 
            fontFamily: "var(--font-space-mono)",
            textTransform: "capitalize",
            marginBottom: "16px"
          }}>
            <span style={{ transform: "scaleX(1.1)", display: "inline-block", transformOrigin: "left" }}>Scan History</span>
          </h2>
          <p style={{ 
            color: "var(--text-secondary)", 
            fontSize: "15px", 
            lineHeight: "1.6" 
          }}>
            Review your past privacy scans, flagged entities, and redaction actions.
          </p>
        </div>

        {history.length > 0 && (
          <div style={{ position: "relative", zIndex: 1, marginTop: "16px" }}>
            <button className="btn btn-danger btn-sm" onClick={clearHistory}>
              <TrashIcon size={14} /> Clear History
            </button>
          </div>
        )}
      </div>

      {history.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="icon"><ClipboardIcon size={48} color="var(--text-muted)" /></div>
          <h3>No Scans Yet</h3>
          <p>Upload and scan a file to see results here</p>
        </div>
      ) : !selected ? (
        <div className="history-list">
          {history.map((item) => (
            <div
              key={item.id}
              className="glass-card history-item"
              onClick={() => setSelected(item)}
            >
              <span style={{ fontSize: 28 }}>{mediaIcon(item.mediaType)}</span>
              <div className="meta">
                <div className="name">{item.fileName}</div>
                <div className="date">
                  {formatBytes(item.fileSize)} · {item.mode} ·{" "}
                  {new Date(item.timestamp).toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  className="score"
                  style={{ color: severityColor(item.riskScore) }}
                >
                  {Math.round(item.riskScore * 100)}%
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {item.entityCount} entities
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="fade-in">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setSelected(null)}
            style={{ marginBottom: 20 }}
          >
            <ArrowLeftIcon size={14} /> Back to list
          </button>

          <div className="glass-card" style={{ padding: 24 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>
                  {mediaIcon(selected.mediaType)} {selected.fileName}
                </h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  {new Date(selected.timestamp).toLocaleString()} · Mode: {selected.mode}
                </p>
              </div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: severityColor(selected.riskScore),
                }}
              >
                {Math.round(selected.riskScore * 100)}%
              </div>
            </div>

            {selected.result.warning_message && (
              <div
                className={`warning-banner ${selected.riskScore >= 0.7 ? "high" : "moderate"}`}
              >
                <AlertTriangleIcon size={16} /> {selected.result.warning_message}
              </div>
            )}

            {selected.result.flagged_entities.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table className="entity-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Value</th>
                      <th>Severity</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.result.flagged_entities.map((fe, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600, textTransform: "capitalize" }}>
                          {fe.detected.type.replace(/_/g, " ")}
                        </td>
                        <td>
                          <code style={{ background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>
                            {fe.detected.raw_value.length > 30
                              ? fe.detected.raw_value.slice(0, 30) + "…"
                              : fe.detected.raw_value}
                          </code>
                        </td>
                        <td>
                          <span className={`badge badge-${fe.contextual.severity_level}`}>
                            {fe.contextual.severity_level}
                          </span>
                        </td>
                        <td>{(fe.contextual.confidence_score * 100).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Audit log */}
            {selected.result.audit_log.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
                  <ClipboardIcon size={14} /> Audit Trail
                </h4>
                <div className="audit-timeline">
                  {selected.result.audit_log.map((event, i) => (
                    <div className="timeline-item" key={i}>
                      <div className="stage">{event.stage.replace(/_/g, " ")}</div>
                      <div className="details">{JSON.stringify(event.details)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
