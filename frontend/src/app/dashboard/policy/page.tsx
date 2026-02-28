"use client";

import { useEffect, useState } from "react";
import {
  type AutoPolicyResponse,
  type ProcessingResponse,
  generateAutoPolicy,
} from "@/lib/api";
import {
  RedactModeIcon,
  CheckCircleIcon,
  CopyIcon,
  ClipboardIcon,
  EditIcon,
  SparklesIcon,
  BrainIcon,
  ZapIcon,
  AlertTriangleIcon,
  BarChartIcon,
  ChevronRightIcon,
} from "@/components/Icons";

const ALL_ENTITY_TYPES = [
  "credit_card",
  "aadhaar",
  "ssn",
  "bank_account",
  "phone",
  "email",
  "address",
  "upi_id",
  "ifsc",
  "swift",
  "iban",
  "person_name",
  "location",
  "date",
  "ip_address",
  "url",
];

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

function analyzeHistory(history: HistoryItem[]) {
  const entityCounts: Record<string, number> = {};
  let totalRisk = 0;
  let highRiskCount = 0;

  for (const item of history) {
    totalRisk += item.riskScore;
    if (item.riskScore >= 0.7) highRiskCount++;
    for (const fe of item.result.flagged_entities) {
      const t = fe.detected.type.toLowerCase();
      entityCounts[t] = (entityCounts[t] || 0) + 1;
    }
  }

  const sorted = Object.entries(entityCounts).sort((a, b) => b[1] - a[1]);

  return {
    entityCounts,
    sortedEntities: sorted,
    totalScans: history.length,
    avgRiskScore: history.length > 0 ? totalRisk / history.length : 0,
    highRiskScans: highRiskCount,
  };
}

function actionColor(action: string): string {
  if (action === "redact") return "var(--danger)";
  if (action === "ignore") return "var(--success)";
  return "var(--warning)";
}

function actionBg(action: string): string {
  if (action === "redact") return "rgba(239, 68, 68, 0.1)";
  if (action === "ignore") return "rgba(16, 185, 129, 0.1)";
  return "rgba(245, 158, 11, 0.1)";
}

type Tab = "manual" | "ai";

export default function PolicyPage() {
  const [tab, setTab] = useState<Tab>("manual");
  const [alwaysRedact, setAlwaysRedact] = useState<string[]>(["credit_card", "aadhaar"]);
  const [ignore, setIgnore] = useState<string[]>(["person_name"]);
  const [copied, setCopied] = useState(false);

  // AI state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPolicy, setAiPolicy] = useState<AutoPolicyResponse | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiApplied, setAiApplied] = useState(false);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("scan_history") || "[]");
    setHistory(stored);
  }, []);

  const stats = analyzeHistory(history);

  function toggleItem(list: string[], setList: (v: string[]) => void, item: string) {
    if (list.includes(item)) {
      setList(list.filter((i) => i !== item));
    } else {
      setList([...list, item]);
    }
  }

  const policyObj = { always_redact: alwaysRedact, ignore: ignore };
  const policyJsonStr = JSON.stringify(policyObj, null, 2);

  function copyToClipboard() {
    navigator.clipboard.writeText(JSON.stringify(policyObj));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleAiGenerate() {
    setAiLoading(true);
    setAiError("");
    setAiPolicy(null);
    setAiApplied(false);

    try {
      const result = await generateAutoPolicy({
        entity_counts: stats.entityCounts,
        total_scans: stats.totalScans,
        avg_risk_score: stats.avgRiskScore,
        high_risk_scans: stats.highRiskScans,
      });
      setAiPolicy(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Failed to generate policy");
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiPolicy() {
    if (!aiPolicy) return;
    setAlwaysRedact([...aiPolicy.always_redact]);
    setIgnore([...aiPolicy.ignore]);
    setAiApplied(true);
    setTab("manual");
    setTimeout(() => setAiApplied(false), 3000);
  }

  function copyAiPolicy() {
    if (!aiPolicy) return;
    navigator.clipboard.writeText(
      JSON.stringify({ always_redact: aiPolicy.always_redact, ignore: aiPolicy.ignore }, null, 2)
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const availableForRedact = ALL_ENTITY_TYPES.filter((t) => !ignore.includes(t));
  const availableForIgnore = ALL_ENTITY_TYPES.filter((t) => !alwaysRedact.includes(t));

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
        
        <div style={{ position: "relative", zIndex: 1, flex: 1, minWidth: "300px" }}>
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
            <span>//</span> COMPLIANCE ENGINE
          </div>
          <h2 style={{ 
            fontSize: "42px", 
            fontWeight: 800, 
            letterSpacing: "-0.02em", 
            fontFamily: "var(--font-space-mono)",
            textTransform: "capitalize",
            marginBottom: "16px"
          }}>
            <span style={{ transform: "scaleX(1.1)", display: "inline-block", transformOrigin: "left" }}>Policy Builder</span>
          </h2>
          <p style={{ 
            color: "var(--text-secondary)", 
            fontSize: "15px", 
            lineHeight: "1.6" 
          }}>
            Configure privacy policies manually or let AI generate them from your scan patterns to automate enterprise redaction.
          </p>
        </div>

        {/* Tab toggle */}
        <div className="trends-range-toggle" style={{ position: "relative", zIndex: 1, marginTop: "16px" }}>
          <button className={`range-btn ${tab === "manual" ? "active" : ""}`} onClick={() => setTab("manual")}>
            <EditIcon size={14} /> Manual
          </button>
          <button className={`range-btn ${tab === "ai" ? "active" : ""}`} onClick={() => setTab("ai")}>
            <SparklesIcon size={14} /> AI Generate
          </button>
        </div>
      </div>

      {/* ─── MANUAL TAB ─── */}
      {tab === "manual" && (
        <div className="fade-in">
          <div className="policy-grid">
            <div>
              {/* Always redact */}
              <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
                <div className="policy-section">
                  <h4>
                    <RedactModeIcon size={16} /> Always Redact
                    <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>
                      These entity types will always be redacted
                    </span>
                  </h4>
                  <div className="tag-list">
                    {availableForRedact.map((type) => (
                      <div
                        key={type}
                        className={`tag ${alwaysRedact.includes(type) ? "active" : ""}`}
                        onClick={() => toggleItem(alwaysRedact, setAlwaysRedact, type)}
                      >
                        {type.replace(/_/g, " ")}
                        {alwaysRedact.includes(type) && <span className="remove">✕</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Ignore */}
              <div className="glass-card" style={{ padding: 24 }}>
                <div className="policy-section">
                  <h4>
                    <svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#64748b" opacity="0.2" /><circle cx="12" cy="12" r="5" fill="#94A3B8" /></svg> Ignore
                    <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>
                      These entity types will be skipped
                    </span>
                  </h4>
                  <div className="tag-list">
                    {availableForIgnore.map((type) => (
                      <div
                        key={type}
                        className={`tag ${ignore.includes(type) ? "active" : ""}`}
                        onClick={() => toggleItem(ignore, setIgnore, type)}
                      >
                        {type.replace(/_/g, " ")}
                        {ignore.includes(type) && <span className="remove">✕</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* JSON Preview */}
            <div>
              <div className="glass-card" style={{ padding: 24, position: "sticky", top: 32 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h4 style={{ fontSize: 15, fontWeight: 700 }}>
                    <EditIcon size={16} /> Generated Policy JSON
                  </h4>
                  <button className="btn btn-secondary btn-sm" onClick={copyToClipboard}>
                    {copied ? <><CheckCircleIcon size={14} /> Copied!</> : <><CopyIcon size={14} /> Copy</>}
                  </button>
                </div>

                <pre
                  style={{
                    background: "var(--bg-secondary)",
                    padding: 20,
                    borderRadius: "var(--radius-sm)",
                    fontSize: 13,
                    lineHeight: 1.7,
                    overflow: "auto",
                    fontFamily: "monospace",
                    border: "1px solid var(--border)",
                    color: "var(--accent)",
                  }}
                >
                  {policyJsonStr}
                </pre>

                <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  Copy this JSON and paste it into the <strong>Policy JSON</strong>{" "}
                  field on the Upload & Scan page when using <strong>Policy Enforced</strong>{" "}
                  mode. Or use it programmatically via the <code>policy_json</code> form field.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── AI GENERATE TAB ─── */}
      {tab === "ai" && (
        <div className="fade-in">
          {/* Scan Stats Summary */}
          <div className="auto-policy-stats">
            <div className="glass-card stat-card-ap">
              <div className="stat-icon-ap" style={{ background: "rgba(14, 165, 233, 0.12)" }}>
                <ClipboardIcon size={20} color="var(--accent)" />
              </div>
              <div className="stat-value-ap">{stats.totalScans}</div>
              <div className="stat-label-ap">Total Scans</div>
            </div>
            <div className="glass-card stat-card-ap">
              <div className="stat-icon-ap" style={{ background: "rgba(245, 158, 11, 0.12)" }}>
                <BarChartIcon size={20} color="var(--warning)" />
              </div>
              <div className="stat-value-ap">{Math.round(stats.avgRiskScore * 100)}%</div>
              <div className="stat-label-ap">Avg Risk Score</div>
            </div>
            <div className="glass-card stat-card-ap">
              <div className="stat-icon-ap" style={{ background: "rgba(239, 68, 68, 0.12)" }}>
                <AlertTriangleIcon size={20} color="var(--danger)" />
              </div>
              <div className="stat-value-ap">{stats.highRiskScans}</div>
              <div className="stat-label-ap">High Risk Scans</div>
            </div>
            <div className="glass-card stat-card-ap">
              <div className="stat-icon-ap" style={{ background: "rgba(16, 185, 129, 0.12)" }}>
                <ZapIcon size={20} color="var(--success)" />
              </div>
              <div className="stat-value-ap">{stats.sortedEntities.length}</div>
              <div className="stat-label-ap">Entity Types</div>
            </div>
          </div>

          {/* Entity Frequency */}
          {stats.sortedEntities.length > 0 && (
            <div className="glass-card" style={{ padding: 24, marginTop: 24 }}>
              <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                <BarChartIcon size={16} /> Entity Frequency Analysis
              </h4>
              <div className="entity-freq-list">
                {stats.sortedEntities.map(([type, count]) => {
                  const pct = Math.round((count / Math.max(stats.totalScans, 1)) * 100);
                  return (
                    <div key={type} className="entity-freq-row">
                      <div className="entity-freq-label">
                        <span style={{ textTransform: "capitalize", fontWeight: 600, fontSize: 13 }}>
                          {type.replace(/_/g, " ")}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {count}× ({pct}% of scans)
                        </span>
                      </div>
                      <div className="entity-freq-bar-bg">
                        <div
                          className="entity-freq-bar-fill"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            background: pct >= 60 ? "var(--danger)" : pct >= 30 ? "var(--warning)" : "var(--accent)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Generate Button */}
          <div style={{ marginTop: 28, display: "flex", gap: 12, alignItems: "center" }}>
            <button
              className="btn btn-primary"
              onClick={handleAiGenerate}
              disabled={aiLoading || stats.totalScans === 0}
            >
              {aiLoading ? (
                <><span className="spinner" /> Analyzing patterns...</>
              ) : (
                <><SparklesIcon size={18} /> Generate AI Policy</>
              )}
            </button>
            {stats.totalScans === 0 && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Scan some files first to enable AI analysis
              </span>
            )}
          </div>

          {aiError && (
            <div className="error-msg" style={{ marginTop: 16 }}>{aiError}</div>
          )}

          {/* AI Policy Result */}
          {aiPolicy && (
            <div className="fade-in" style={{ marginTop: 32 }}>
              {/* AI Reasoning */}
              <div className="glass-card ap-reasoning-card">
                <div className="ap-reasoning-header">
                  <BrainIcon size={18} color="var(--accent)" />
                  <span>AI Analysis</span>
                </div>
                <p className="ap-reasoning-text">{aiPolicy.reasoning}</p>
              </div>

              {/* Recommendations */}
              <div style={{ marginTop: 24 }}>
                <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Recommendations</h4>
                <div className="ap-recommendations-grid">
                  {aiPolicy.recommendations.map((rec, i) => (
                    <div key={i} className="glass-card ap-rec-card">
                      <div className="ap-rec-header">
                        <span className="ap-rec-action" style={{ background: actionBg(rec.action), color: actionColor(rec.action) }}>
                          {rec.action.toUpperCase()}
                        </span>
                        <span className="ap-rec-type">{rec.entity_type.replace(/_/g, " ")}</span>
                        <ChevronRightIcon size={14} color="var(--text-muted)" />
                      </div>
                      <p className="ap-rec-reason">{rec.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Generated Policy JSON + Actions */}
              <div className="glass-card" style={{ padding: 24, marginTop: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                  <h4 style={{ fontSize: 15, fontWeight: 700 }}>Generated Policy</h4>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={copyAiPolicy}>
                      {copied ? <><CheckCircleIcon size={14} /> Copied!</> : <><CopyIcon size={14} /> Copy</>}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={applyAiPolicy}>
                      {aiApplied ? <><CheckCircleIcon size={14} /> Applied!</> : <><ZapIcon size={14} /> Apply to Manual Builder</>}
                    </button>
                  </div>
                </div>
                <pre
                  style={{
                    background: "var(--bg-secondary)",
                    padding: 20,
                    borderRadius: "var(--radius-sm)",
                    fontSize: 13,
                    lineHeight: 1.7,
                    overflow: "auto",
                    fontFamily: "monospace",
                    border: "1px solid var(--border)",
                    color: "var(--accent)",
                  }}
                >
                  {JSON.stringify({ always_redact: aiPolicy.always_redact, ignore: aiPolicy.ignore }, null, 2)}
                </pre>
                <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  Click <strong>Apply to Manual Builder</strong> to load this AI-generated policy into the manual editor for further tweaking.
                </p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {stats.totalScans === 0 && !aiLoading && !aiPolicy && (
            <div className="glass-card empty-state" style={{ marginTop: 32 }}>
              <div className="icon"><SparklesIcon size={48} color="var(--text-muted)" /></div>
              <h3>No Scan Data Yet</h3>
              <p>Upload and scan files first — the AI agent will analyze your patterns and build an optimal privacy policy for you.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
