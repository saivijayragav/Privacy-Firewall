"use client";

import {
  type MediaType,
  type ProcessingMode,
  type ProcessingResponse,
  processFile,
} from "@/lib/api";
import { useCallback, useRef, useState } from "react";
import {
  FolderIcon,
  ImageIcon,
  MusicIcon,
  FileTextIcon,
  SearchIcon,
  FlagIcon,
  BrainIcon,
  ClipboardIcon,
  CheckCircleIcon,
  DownloadIcon,
  AlertTriangleIcon,
  FlagModeIcon,
  WarnModeIcon,
  RedactModeIcon,
  PolicyModeIcon,
} from "@/components/Icons";

const MODES: {
  value: ProcessingMode;
  icon: React.ReactNode;
  name: string;
  desc: string;
}[] = [
  {
    value: "flag",
    icon: <FlagModeIcon size={20} />,
    name: "Flag Only",
    desc: "Detect & flag sensitive items without altering the file",
  },
  {
    value: "warn",
    icon: <WarnModeIcon size={20} />,
    name: "Warn & Recommend",
    desc: "Flag items and recommend redaction actions",
  },
  {
    value: "auto_redact",
    icon: <RedactModeIcon size={20} />,
    name: "Auto Redact",
    desc: "Automatically detect and redact sensitive content",
  },
  {
    value: "policy",
    icon: <PolicyModeIcon size={20} />,
    name: "Policy Enforced",
    desc: "Apply enterprise rules for selective redaction",
  },
];

function detectMediaType(file: File): MediaType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fileIcon(type: MediaType): React.ReactNode {
  if (type === "image") return <ImageIcon size={28} color="var(--accent)" />;
  if (type === "audio") return <MusicIcon size={28} color="var(--accent)" />;
  return <FileTextIcon size={28} color="var(--accent)" />;
}

function severityColor(s: string): string {
  if (s === "high") return "var(--danger)";
  if (s === "medium") return "var(--warning)";
  return "var(--success)";
}

export default function DashboardPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>("document");
  const [mode, setMode] = useState<ProcessingMode>("warn");
  const [threshold, setThreshold] = useState(0.65);
  const [applyRedaction, setApplyRedaction] = useState(false);
  const [policyJson, setPolicyJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcessingResponse | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setMediaType(detectMediaType(f));
    setResult(null);
    setError("");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    },
    [handleFile]
  );

  async function handleScan() {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await processFile(file, mediaType, {
        mode,
        apply_redaction: applyRedaction,
        score_threshold: threshold,
        policy_json: mode === "policy" ? policyJson : undefined,
      });
      setResult(res);

      // Save to history
      const history = JSON.parse(localStorage.getItem("scan_history") || "[]");
      history.unshift({
        id: Date.now(),
        fileName: file.name,
        fileSize: file.size,
        mediaType,
        mode,
        riskScore: res.risk_score,
        entityCount: res.flagged_entities.length,
        timestamp: new Date().toISOString(),
        result: res,
      });
      localStorage.setItem(
        "scan_history",
        JSON.stringify(history.slice(0, 50))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  const riskPercent = result ? Math.round(result.risk_score * 100) : 0;
  const circumference = 2 * Math.PI * 72;
  const dashOffset = circumference - (circumference * riskPercent) / 100;

  return (
    <div>
      <div className="page-header">
        <h2>Upload & Scan</h2>
        <p>Upload a file to scan for sensitive information</p>
      </div>

      {/* Upload zone */}
      <div
        className={`upload-zone ${dragOver ? "drag-over" : ""}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <span className="upload-icon"><FolderIcon size={48} color="var(--accent)" /></span>
        <h3>Drop your file here, or click to browse</h3>
        <p>
          Supports images (JPG, PNG), documents (PDF, TXT), and audio (WAV, MP3)
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,audio/*,.pdf,.txt,.doc,.docx"
          onChange={(e) => {
            if (e.target.files?.[0]) handleFile(e.target.files[0]);
          }}
        />
      </div>

      {/* File preview */}
      {file && (
        <div className="file-preview fade-in">
          <span className="file-icon">{fileIcon(mediaType)}</span>
          <div className="file-info">
            <div className="name">{file.name}</div>
            <div className="size">
              {formatBytes(file.size)} · {mediaType}
            </div>
          </div>
          <button
            className="remove-btn"
            onClick={() => {
              setFile(null);
              setResult(null);
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Mode selector */}
      <div style={{ marginTop: 28 }}>
        <label
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-secondary)",
            display: "block",
            marginBottom: 10,
          }}
        >
          Processing Mode
        </label>
        <div className="mode-grid">
          {MODES.map((m) => (
            <div
              key={m.value}
              className={`mode-option ${mode === m.value ? "selected" : ""}`}
              onClick={() => setMode(m.value)}
            >
              <span className="mode-icon">{m.icon}</span>
              <div className="mode-name">{m.name}</div>
              <div className="mode-desc">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="options-panel">
        <div className="option-group">
          <label>Risk Threshold</label>
          <input
            type="range"
            className="threshold-slider"
            min="0"
            max="1"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
          />
          <div className="threshold-value">{threshold.toFixed(2)}</div>
        </div>

        <div className="option-group">
          <label style={{ marginBottom: 12 }}>Options</label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              cursor: "pointer",
              color: "var(--text-secondary)",
            }}
          >
            <input
              type="checkbox"
              checked={applyRedaction}
              onChange={(e) => setApplyRedaction(e.target.checked)}
              style={{ accentColor: "var(--accent)" }}
            />
            Apply redaction to file
          </label>
        </div>
      </div>

      {/* Policy JSON (only for policy mode) */}
      {mode === "policy" && (
        <div style={{ marginTop: 20 }} className="fade-in">
          <label
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 8,
            }}
          >
            Policy JSON
          </label>
          <textarea
            className="form-input"
            rows={4}
            placeholder='{"always_redact": ["credit_card", "aadhaar"], "ignore": ["person_name"]}'
            value={policyJson}
            onChange={(e) => setPolicyJson(e.target.value)}
            style={{ resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
          />
        </div>
      )}

      {/* Scan button */}
      <div style={{ marginTop: 28 }}>
        <button
          className="btn btn-primary"
          onClick={handleScan}
          disabled={!file || loading}
        >
          {loading ? (
            <>
              <span className="spinner" /> Scanning...
            </>
          ) : (
            <><SearchIcon size={18} /> Scan File</>
          )}
        </button>
      </div>

      {error && (
        <div className="error-msg" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{ marginTop: 40 }} className="fade-in">
          <h3
            style={{
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 20,
            }}
          >
            Scan Results
          </h3>

          {/* Warning banner */}
          {result.warning_message && (
            <div
              className={`warning-banner ${riskPercent >= 70 ? "high" : "moderate"}`}
            >
              <AlertTriangleIcon size={16} /> {result.warning_message}
            </div>
          )}

          <div className="results-grid">
            {/* Risk gauge */}
            <div className="glass-card risk-card">
              <div className="risk-gauge">
                <svg width="180" height="180" viewBox="0 0 180 180">
                  <circle
                    className="track"
                    cx="90"
                    cy="90"
                    r="72"
                    fill="none"
                    strokeWidth="10"
                  />
                  <circle
                    className="fill"
                    cx="90"
                    cy="90"
                    r="72"
                    fill="none"
                    strokeWidth="10"
                    stroke={severityColor(riskPercent >= 70 ? "high" : riskPercent >= 40 ? "medium" : "low")}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                  />
                </svg>
                <div className="score-text">
                  <span
                    className="value"
                    style={{
                      color: severityColor(
                        riskPercent >= 70
                          ? "high"
                          : riskPercent >= 40
                            ? "medium"
                            : "low"
                      ),
                    }}
                  >
                    {riskPercent}
                  </span>
                  <span className="label">Risk Score</span>
                </div>
              </div>

              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Mode: <strong>{result.mode_used}</strong>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  marginTop: 4,
                }}
              >
                Entities flagged:{" "}
                <strong>{result.flagged_entities.length}</strong>
              </div>

              {result.output_file_path && (
                <div style={{ marginTop: 16 }}>
                  <a
                    href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/download?path=${encodeURIComponent(result.output_file_path)}`}
                    className="btn btn-secondary btn-sm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <DownloadIcon size={16} /> Download Redacted
                  </a>
                </div>
              )}
            </div>

            {/* Details */}
            <div>
              {/* Flagged entities */}
              {result.flagged_entities.length > 0 ? (
                <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
                  <div
                    style={{
                      padding: "16px 20px",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <h4 style={{ fontSize: 15, fontWeight: 700 }}>
                      <FlagIcon size={16} /> Flagged Entities
                    </h4>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="entity-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Value</th>
                          <th>Severity</th>
                          <th>Confidence</th>
                          <th>Reasoning</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.flagged_entities.map((fe, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600, textTransform: "capitalize" }}>
                              {fe.detected.type.replace(/_/g, " ")}
                            </td>
                            <td>
                              <code
                                style={{
                                  background: "rgba(255,255,255,0.06)",
                                  padding: "2px 8px",
                                  borderRadius: 4,
                                  fontSize: 12,
                                }}
                              >
                                {fe.detected.raw_value.length > 30
                                  ? fe.detected.raw_value.slice(0, 30) + "…"
                                  : fe.detected.raw_value}
                              </code>
                            </td>
                            <td>
                              <span
                                className={`badge badge-${fe.contextual.severity_level}`}
                              >
                                {fe.contextual.severity_level}
                              </span>
                            </td>
                            <td>
                              {(fe.contextual.confidence_score * 100).toFixed(0)}%
                            </td>
                            <td
                              style={{
                                fontSize: 12,
                                color: "var(--text-muted)",
                                maxWidth: 200,
                              }}
                            >
                              {fe.contextual.reasoning}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="glass-card empty-state">
                  <div className="icon"><CheckCircleIcon size={48} color="var(--success)" /></div>
                  <h3>No Sensitive Entities Found</h3>
                  <p>This file appears to be safe</p>
                </div>
              )}

              {/* Reasoning trace */}
              {result.reasoning_trace.length > 0 && (
                <div
                  className="glass-card"
                  style={{ marginTop: 20, padding: 24 }}
                >
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
                    <BrainIcon size={16} /> AI Reasoning
                  </h4>
                  {result.reasoning_trace.map((trace, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 0",
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        borderBottom:
                          i < result.reasoning_trace.length - 1
                            ? "1px solid var(--border)"
                            : "none",
                      }}
                    >
                      {trace}
                    </div>
                  ))}
                </div>
              )}

              {/* Audit log */}
              {result.audit_log.length > 0 && (
                <div
                  className="glass-card"
                  style={{ marginTop: 20, padding: 24 }}
                >
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>
                    <ClipboardIcon size={16} /> Audit Log
                  </h4>
                  <div className="audit-timeline">
                    {result.audit_log.map((event, i) => (
                      <div className="timeline-item" key={i}>
                        <div className="stage">
                          {event.stage.replace(/_/g, " ")}
                        </div>
                        <div className="details">
                          {JSON.stringify(event.details)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
