"use client";

import {
  type MediaType,
  type ProcessingMode,
  type ProcessingResponse,
  type ScanResponse,
  type RedactResponse,
  type ManualRegion,
  processFile,
  scanFile,
  redactFile,
  generateComplianceReport,
  getPrivacySuggestions,
} from "@/lib/api";
import { useCallback, useRef, useState } from "react";
import { ImageRedactionEditor } from "@/components/ImageRedactionEditor";
import { PdfRedactionEditor } from "@/components/PdfRedactionEditor";
import { ListRedactionEditor } from "@/components/ListRedactionEditor";
import {
  FolderIcon,
  ImageIcon,
  MusicIcon,
  FileTextIcon,
  SearchIcon,
  FlagIcon,
  BrainIcon,
  ClipboardIcon,
  SparklesIcon,
  CheckCircleIcon,
  DownloadIcon,
  AlertTriangleIcon,
  FlagModeIcon,
  WarnModeIcon,
  RedactModeIcon,
  PolicyModeIcon,
  ArrowUpIcon
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
  const [useLlm, setUseLlm] = useState(true);
  const [policyJson, setPolicyJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResponse | ProcessingResponse | null>(null);
  const [redactResult, setRedactResult] = useState<RedactResponse | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [reportLoading, setReportLoading] = useState(false);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setMediaType(detectMediaType(f));
    setScanResult(null);
    setRedactResult(null);
    setIsReviewing(false);
    setError("");
    setSuggestions([]);
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
    setScanResult(null);
    setRedactResult(null);
    setIsReviewing(false);
    setSuggestions([]);

    try {
      if (applyRedaction) {
        // Two-phase workflow for all media types
        const res = await scanFile(file, mediaType, useLlm);
        setScanResult(res);
        setIsReviewing(true);
      } else {
        // Original workflow 
        const res = await processFile(file, mediaType, {
          mode,
          apply_redaction: mode === "auto_redact" || mode === "policy",
          score_threshold: threshold,
          policy_json: mode === "policy" ? policyJson : undefined,
          use_llm: useLlm,
        });
        setScanResult(res);

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
        localStorage.setItem("scan_history", JSON.stringify(history.slice(0, 50)));

        // Asynchronously fetch Proactive Advice only for "warn" mode
        if (mode === "warn" && res.flagged_entities.length > 0) {
          setLoadingSuggestions(true);
          getPrivacySuggestions({
            filename: file.name,
            media_type: mediaType,
            risk_score: res.risk_score,
            flagged_entities: res.flagged_entities.map((f) => ({
              type: f.detected.type,
              raw_value: f.detected.raw_value,
              severity: f.contextual.severity_level,
              reasoning: f.contextual.reasoning,
            })),
          })
            .then((sRes) => setSuggestions(sRes.suggestions))
            .catch((e) => console.error("Suggestions failed:", e))
            .finally(() => setLoadingSuggestions(false));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRedactConfirm(approvedIds: string[], manualRegions: ManualRegion[]) {
    if (!scanResult || !("scan_id" in scanResult)) return;
    setLoading(true);
    setError("");

    try {
      const res = await redactFile({
        scan_id: scanResult.scan_id,
        approved_region_ids: approvedIds,
        manual_regions: manualRegions
      });
      setRedactResult(res);
      setIsReviewing(false);

      // Save to history here
      const history = JSON.parse(localStorage.getItem("scan_history") || "[]");
      history.unshift({
        id: Date.now(),
        fileName: file!.name,
        fileSize: file!.size,
        mediaType,
        mode,
        riskScore: scanResult.risk_score,
        entityCount: scanResult.flagged_entities.length,
        timestamp: new Date().toISOString(),
        result: {
          ...scanResult,
          object_store_key: res.object_key,
          download_url: res.download_url
        },
      });
      localStorage.setItem("scan_history", JSON.stringify(history.slice(0, 50)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Redaction failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateReport() {
    if (!scanResult || !file) return;
    setReportLoading(true);
    setError("");
    setReportMarkdown(null);
    setReportModalOpen(true);

    try {
      const res = await generateComplianceReport({
        filename: file.name,
        media_type: mediaType,
        risk_score: scanResult.risk_score,
        flagged_entities: scanResult.flagged_entities.map((f) => ({
          type: f.detected.type,
          raw_value: f.detected.raw_value,
          severity: f.contextual.severity_level,
          reasoning: f.contextual.reasoning,
        })),
      });
      setReportMarkdown(res.report_markdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed");
      setReportModalOpen(false);
    } finally {
      setReportLoading(false);
    }
  }

  function downloadReport() {
    if (!reportMarkdown || !file) return;
    const blob = new Blob([reportMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Privacy_Report_${file.name}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const riskPercent = scanResult ? Math.round(scanResult.risk_score * 100) : 0;
  const circumference = 2 * Math.PI * 72;
  const dashOffset = circumference - (circumference * riskPercent) / 100;

  // Determine the final redacted file source (from interactive review or auto-redact mode)
  const finalDownloadUrl = redactResult?.download_url || (scanResult && "download_url" in scanResult ? scanResult.download_url : undefined);
  const finalLocalPath = redactResult?.local_path || (scanResult && "output_file_path" in scanResult ? scanResult.output_file_path : undefined);

  return (
    <div>
      {/* Hero Header with Grid Background */}
      <div style={{
        position: "relative",
        padding: "32px 0 20px", // Reduced from 40px
        marginBottom: "16px", // Reduced from 32px
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
            <span>//</span> PII DETECTION ENGINE
          </div>
          <h2 style={{ 
            fontSize: "42px", 
            fontWeight: 800, 
            letterSpacing: "-0.02em", 
            fontFamily: "var(--font-space-mono)",
            textTransform: "capitalize", // Allows mixed case scaling while retaining modern width
            marginBottom: "16px"
          }}>
            <span style={{ transform: "scaleX(1.1)", display: "inline-block", transformOrigin: "left" }}>Upload & Scan</span>
          </h2>
          <p style={{ 
            color: "var(--text-muted)", // slightly softer color if desired
            fontSize: "14px", 
            lineHeight: "1.6",
            fontFamily: "var(--font-space-mono)",
            margin: 0 // Removes any default block margin
          }}>
            Detect, classify, and redact personally identifiable information from documents, images, and audio files using multi-layer analysis.
          </p>
        </div>
      </div>

      {/* Upload zone redesign */}
      <div
        className={`upload-zone ${dragOver ? "drag-over" : ""}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: "1px dashed rgba(255, 255, 255, 0.1)",
          borderRadius: "16px",
          padding: "32px 24px", // Reduced from 48px to tighten vertical height
          marginBottom: "32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-secondary)",
          cursor: "pointer",
          transition: "all 0.2s"
        }}
      >
        <div style={{
          width: "56px",
          height: "56px",
          borderRadius: "14px",
          backgroundColor: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "20px"
        }}>
          <ArrowUpIcon size={24} color="var(--accent)" />
        </div>
        
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>
          Drop your file here, or click to browse
        </h3>
        
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "4px", fontFamily: "var(--font-space-mono)" }}>
          Max file size: 50MB per file
        </p>
        
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
          {["JPG", "PNG", "WEBP", "PDF", "TXT", "WAV", "MP3"].map(ext => (
            <span key={ext} style={{ 
              fontSize: "10px", 
              fontWeight: 600, 
              padding: "4px 8px", 
              borderRadius: "6px", 
              border: "1px solid rgba(255,255,255,0.08)",
              color: ext === "PDF" || ext === "TXT" ? "var(--warning)" : ext === "WAV" || ext === "MP3" ? "#a855f7" : "var(--accent)"
            }}>
              {ext}
            </span>
          ))}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,audio/*,.pdf,.txt,.doc,.docx"
          style={{ display: "none" }}
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
              setScanResult(null);
              setRedactResult(null);
              setIsReviewing(false);
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
            Manually review before redaction
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              cursor: "pointer",
              color: "var(--text-secondary)",
              marginTop: 8,
            }}
          >
            <input
              type="checkbox"
              checked={useLlm}
              onChange={(e) => setUseLlm(e.target.checked)}
              style={{ accentColor: "var(--accent)" }}
            />
            Use AI/LLM for enhanced detection
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

      {/* Interactive Review UI */}
      {isReviewing && scanResult && file && mediaType === "image" && (
        <ImageRedactionEditor
          file={file}
          scanResult={scanResult as ScanResponse}
          onRedact={handleRedactConfirm}
          onCancel={() => setIsReviewing(false)}
        />
      )}

      {isReviewing && scanResult && file && file.type === "application/pdf" && (
        <PdfRedactionEditor
          file={file}
          scanResult={scanResult as ScanResponse}
          onRedact={handleRedactConfirm}
          onCancel={() => setIsReviewing(false)}
        />
      )}

      {isReviewing && scanResult && file && mediaType !== "image" && file.type !== "application/pdf" && (
        <ListRedactionEditor
          file={file}
          scanResult={scanResult as ScanResponse}
          onRedact={handleRedactConfirm}
          onCancel={() => setIsReviewing(false)}
        />
      )}

      {/* Before / After Preview (when Redaction is complete) */}
      {!isReviewing && scanResult && (finalDownloadUrl || finalLocalPath) && (
        <div style={{ marginTop: 40 }} className="fade-in">
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Redaction Complete</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* Original */}
            <div className="glass-card" style={{ padding: 16 }}>
              <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 14, color: "var(--text-secondary)" }}>Original (Before)</div>
              {mediaType === "image" && file && <img src={URL.createObjectURL(file)} alt="Original" style={{ width: "100%", borderRadius: 8 }} />}
              {mediaType === "audio" && file && <audio controls src={URL.createObjectURL(file)} style={{ width: "100%" }} />}
              {mediaType === "document" && file && <iframe src={URL.createObjectURL(file)} style={{ width: "100%", height: 400, border: "none", borderRadius: 8, background: "#fff" }} />}
            </div>

            {/* Redacted */}
            <div className="glass-card" style={{ padding: 16, border: "1px solid var(--accent)" }}>
              <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 14, color: "var(--accent)" }}>Redacted (After)</div>
              {mediaType === "image" && <img src={finalDownloadUrl || `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/download?path=${encodeURIComponent(finalLocalPath || "")}`} alt="Redacted" style={{ width: "100%", borderRadius: 8 }} />}
              {mediaType === "audio" && <audio controls src={finalDownloadUrl || `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/download?path=${encodeURIComponent(finalLocalPath || "")}`} style={{ width: "100%" }} />}
              {mediaType === "document" && <iframe src={finalDownloadUrl || `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/download?path=${encodeURIComponent(finalLocalPath || "")}`} style={{ width: "100%", height: 400, border: "none", borderRadius: 8, background: "#fff" }} />}
            </div>
          </div>
        </div>
      )}

      {/* Results details */}
      {scanResult && !isReviewing && (
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
          {scanResult.warning_message && (
            <div
              className={`warning-banner ${riskPercent >= 70 ? "high" : "moderate"}`}
            >
              <AlertTriangleIcon size={16} /> {scanResult.warning_message}
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
                Mode: <strong>{("mode_used" in scanResult) ? scanResult.mode_used : mode}</strong>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  marginTop: 4,
                }}
              >
                Entities flagged:{" "}
                <strong>{scanResult.flagged_entities.length}</strong>
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
                {finalLocalPath && (
                  <a
                    href={finalDownloadUrl || `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/download?path=${encodeURIComponent(finalLocalPath)}`}
                    className="btn btn-secondary btn-sm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <DownloadIcon size={16} /> Download Redacted
                  </a>
                )}
                <button
                  onClick={handleGenerateReport}
                  className="btn btn-primary btn-sm"
                  disabled={reportLoading}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  {reportLoading ? "Generating..." : <><ClipboardIcon size={14} /> Generate Privacy Report</>}
                </button>
              </div>
            </div>

            {/* Details */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Proactive AI Advice */}
              {(suggestions.length > 0 || loadingSuggestions) && (
                <div className="glass-card" style={{ padding: 20, border: "1px solid var(--accent)", background: "rgba(14, 165, 233, 0.03)" }}>
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, color: "var(--accent)" }}>
                    <SparklesIcon size={18} /> Proactive Advice
                  </h4>
                  {loadingSuggestions ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div className="skeleton" style={{ height: 16, width: "100%", borderRadius: 4 }}></div>
                      <div className="skeleton" style={{ height: 16, width: "85%", borderRadius: 4 }}></div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {suggestions.map((advice, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <span style={{ color: "var(--accent)", marginTop: 2 }}>✦</span>
                          <span style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5 }}>{advice}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Flagged entities */}
              {scanResult.flagged_entities.length > 0 ? (
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
                        {scanResult.flagged_entities.map((fe, i) => (
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
              {scanResult.reasoning_trace.length > 0 && (
                <div
                  className="glass-card"
                  style={{ marginTop: 20, padding: 24 }}
                >
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
                    <BrainIcon size={16} /> AI Reasoning
                  </h4>
                  {scanResult.reasoning_trace.map((trace, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 0",
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        borderBottom:
                          i < scanResult.reasoning_trace.length - 1
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
              {scanResult.audit_log.length > 0 && (
                <div
                  className="glass-card"
                  style={{ marginTop: 20, padding: 24 }}
                >
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>
                    <ClipboardIcon size={16} /> Audit Log
                  </h4>
                  <div className="audit-timeline">
                    {scanResult.audit_log.map((event, i) => (
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

      {/* Render the Report Modal */}
      {reportModalOpen && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
          padding: 20
        }}>
          <div className="glass-card fade-in" style={{
            width: "100%", maxWidth: 800, maxHeight: "90vh",
            display: "flex", flexDirection: "column",
            overflow: "hidden", padding: 0
          }}>
            <div style={{ padding: 20, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <ClipboardIcon size={20} color="var(--accent)" /> Smart Privacy Report
              </h3>
              <button
                onClick={() => setReportModalOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 24, padding: "0 8px" }}
              >
                &times;
              </button>
            </div>

            <div style={{ padding: 24, overflowY: "auto", flex: 1, backgroundColor: "var(--bg-secondary)" }}>
              {reportLoading ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, color: "var(--text-muted)" }}>
                  <div className="spinner" style={{ marginBottom: 16, border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "var(--accent)", borderRadius: "50%", width: 24, height: 24, animation: "spin 1s linear infinite" }}></div>
                  <p>Analyzing compliance risks and generating report...</p>
                </div>
              ) : reportMarkdown ? (
                <pre style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "var(--text)",
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  margin: 0
                }}>
                  {reportMarkdown}
                </pre>
              ) : (
                <p style={{ color: "var(--danger)" }}>Failed to load report.</p>
              )}
            </div>

            <div style={{ padding: 20, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn btn-primary"
                onClick={downloadReport}
                disabled={reportLoading || !reportMarkdown}
              >
                <DownloadIcon size={16} /> Download Report (.md)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
