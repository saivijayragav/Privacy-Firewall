"use client";

import { useEffect, useState, useMemo } from "react";
import { type ProcessingResponse } from "@/lib/api";
import {
  TrendingUpIcon,
  BarChartIcon,
  AlertTriangleIcon,
  ClipboardIcon,
  CheckCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  SearchIcon,
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

type TimeRange = "7d" | "30d" | "all";

function severityColor(score: number): string {
  if (score >= 0.7) return "var(--danger)";
  if (score >= 0.4) return "var(--warning)";
  return "var(--success)";
}

function groupByDay(items: HistoryItem[]): Record<string, HistoryItem[]> {
  const groups: Record<string, HistoryItem[]> = {};
  for (const item of items) {
    const day = new Date(item.timestamp).toISOString().split("T")[0];
    if (!groups[day]) groups[day] = [];
    groups[day].push(item);
  }
  return groups;
}

function getDayLabels(range: TimeRange): string[] {
  const days: string[] = [];
  const n = range === "7d" ? 7 : range === "30d" ? 30 : 60;
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

export default function TrendsPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [range, setRange] = useState<TimeRange>("7d");

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("scan_history") || "[]");
    setHistory(stored);
  }, []);

  const filtered = useMemo(() => {
    if (range === "all") return history;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (range === "7d" ? 7 : 30));
    return history.filter((item) => new Date(item.timestamp) >= cutoff);
  }, [history, range]);

  const dayLabels = useMemo(() => getDayLabels(range), [range]);
  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  // Compute daily average risk scores
  const dailyScores = useMemo(() => {
    return dayLabels.map((day) => {
      const items = grouped[day] || [];
      if (items.length === 0) return null;
      const avg = items.reduce((s, i) => s + i.riskScore, 0) / items.length;
      return avg;
    });
  }, [dayLabels, grouped]);

  // Compute daily scan counts
  const dailyCounts = useMemo(() => {
    return dayLabels.map((day) => (grouped[day] || []).length);
  }, [dayLabels, grouped]);

  // Stats
  const totalScans = filtered.length;
  const avgRisk = totalScans > 0
    ? filtered.reduce((s, i) => s + i.riskScore, 0) / totalScans
    : 0;
  const highRiskCount = filtered.filter((i) => i.riskScore >= 0.7).length;

  // Compare to previous period
  const prevCutoff = new Date();
  const rangeNum = range === "7d" ? 7 : range === "30d" ? 30 : 9999;
  prevCutoff.setDate(prevCutoff.getDate() - rangeNum * 2);
  const currentCutoff = new Date();
  currentCutoff.setDate(currentCutoff.getDate() - rangeNum);
  const prevPeriod = history.filter((i) => {
    const d = new Date(i.timestamp);
    return d >= prevCutoff && d < currentCutoff;
  });
  const prevAvgRisk = prevPeriod.length > 0
    ? prevPeriod.reduce((s, i) => s + i.riskScore, 0) / prevPeriod.length
    : 0;
  const riskChange = prevPeriod.length > 0 ? avgRisk - prevAvgRisk : 0;
  const riskImproved = riskChange < 0;

  // Entity frequency breakdown
  const entityFreq = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of filtered) {
      for (const fe of item.result.flagged_entities) {
        const t = fe.detected.type.toLowerCase();
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const maxEntityCount = entityFreq.length > 0 ? entityFreq[0][1] : 1;

  // Recurring patterns
  const patterns = useMemo(() => {
    const msgs: string[] = [];
    const fileTypeMap: Record<string, number> = {};
    for (const item of filtered) {
      const ext = item.fileName.split(".").pop()?.toLowerCase() || "unknown";
      fileTypeMap[ext] = (fileTypeMap[ext] || 0) + 1;
    }

    // Most common file type
    const topFileType = Object.entries(fileTypeMap).sort((a, b) => b[1] - a[1])[0];
    if (topFileType && topFileType[1] > 1) {
      msgs.push(`Most scanned file type: .${topFileType[0]} (${topFileType[1]} files)`);
    }

    // High risk entity patterns
    for (const [type, count] of entityFreq.slice(0, 3)) {
      const pct = Math.round((count / Math.max(totalScans, 1)) * 100);
      if (pct >= 50) {
        msgs.push(`${type.replace(/_/g, " ")} appears in ${pct}% of your scans — consider always redacting`);
      }
    }

    if (highRiskCount > 0 && totalScans > 0) {
      const hpct = Math.round((highRiskCount / totalScans) * 100);
      msgs.push(`${hpct}% of your scans have high risk scores (≥70%)`);
    }

    if (riskImproved && prevPeriod.length > 0) {
      msgs.push(`Your average risk score improved by ${Math.abs(Math.round(riskChange * 100))} points compared to the previous period`);
    } else if (!riskImproved && riskChange > 0 && prevPeriod.length > 0) {
      msgs.push(`Your average risk score increased by ${Math.round(riskChange * 100)} points — review your recent uploads`);
    }

    if (msgs.length === 0 && totalScans > 0) {
      msgs.push("Keep scanning to discover recurring privacy patterns");
    }

    return msgs;
  }, [filtered, entityFreq, totalScans, highRiskCount, riskChange, riskImproved, prevPeriod.length]);

  // SVG chart dimensions
  const chartW = 800;
  const chartH = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const plotW = chartW - padding.left - padding.right;
  const plotH = chartH - padding.top - padding.bottom;

  // Build polyline points for risk chart
  const validPoints = dailyScores
    .map((score, i) => (score !== null ? { i, score } : null))
    .filter(Boolean) as { i: number; score: number }[];

  const polylinePoints = validPoints
    .map(({ i, score }) => {
      const x = padding.left + (i / Math.max(dayLabels.length - 1, 1)) * plotW;
      const y = padding.top + plotH - score * plotH;
      return `${x},${y}`;
    })
    .join(" ");

  // X-axis labels (show subset)
  const step = Math.max(1, Math.floor(dayLabels.length / 7));
  const xLabels = dayLabels.filter((_, i) => i % step === 0 || i === dayLabels.length - 1);

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
            <span>//</span> METRICS & INSIGHTS
          </div>
          <h2 style={{ 
            fontSize: "42px", 
            fontWeight: 800, 
            letterSpacing: "-0.02em", 
            fontFamily: "var(--font-space-mono)",
            textTransform: "capitalize",
            marginBottom: "16px"
          }}>
            <span style={{ transform: "scaleX(1.1)", display: "inline-block", transformOrigin: "left" }}>Privacy Score Trends</span>
          </h2>
          <p style={{ 
            color: "var(--text-secondary)", 
            fontSize: "15px", 
            lineHeight: "1.6" 
          }}>
            Track your privacy behavior and risk classification patterns across your entire organizational footprint over time.
          </p>
        </div>

        <div className="trends-range-toggle" style={{ position: "relative", zIndex: 1, marginTop: "16px" }}>
          {(["7d", "30d", "all"] as TimeRange[]).map((r) => (
            <button
              key={r}
              className={`range-btn ${range === r ? "active" : ""}`}
              onClick={() => setRange(r)}
            >
              {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "All Time"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="trends-stats-grid">
        <div className="glass-card stat-card-trend">
          <div className="stat-icon-trend" style={{ background: "rgba(14, 165, 233, 0.12)" }}>
            <ClipboardIcon size={20} color="var(--accent)" />
          </div>
          <div>
            <div className="stat-value-trend">{totalScans}</div>
            <div className="stat-label-trend">Total Scans</div>
          </div>
        </div>
        <div className="glass-card stat-card-trend">
          <div className="stat-icon-trend" style={{ background: avgRisk >= 0.7 ? "rgba(239,68,68,0.12)" : avgRisk >= 0.4 ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.12)" }}>
            <BarChartIcon size={20} color={severityColor(avgRisk)} />
          </div>
          <div>
            <div className="stat-value-trend" style={{ color: severityColor(avgRisk) }}>
              {Math.round(avgRisk * 100)}%
            </div>
            <div className="stat-label-trend">Avg Risk Score</div>
          </div>
          {prevPeriod.length > 0 && (
            <div className={`trend-change ${riskImproved ? "improved" : "worsened"}`}>
              {riskImproved ? <ArrowDownIcon size={12} /> : <ArrowUpIcon size={12} />}
              {Math.abs(Math.round(riskChange * 100))}pts
            </div>
          )}
        </div>
        <div className="glass-card stat-card-trend">
          <div className="stat-icon-trend" style={{ background: "rgba(239, 68, 68, 0.12)" }}>
            <AlertTriangleIcon size={20} color="var(--danger)" />
          </div>
          <div>
            <div className="stat-value-trend">{highRiskCount}</div>
            <div className="stat-label-trend">High Risk Scans</div>
          </div>
        </div>
        <div className="glass-card stat-card-trend">
          <div className="stat-icon-trend" style={{ background: "rgba(16, 185, 129, 0.12)" }}>
            <CheckCircleIcon size={20} color="var(--success)" />
          </div>
          <div>
            <div className="stat-value-trend">
              {totalScans > 0 ? totalScans - highRiskCount : 0}
            </div>
            <div className="stat-label-trend">Safe Scans</div>
          </div>
        </div>
      </div>

      {/* Risk Trend Chart */}
      {totalScans > 0 ? (
        <div className="glass-card" style={{ padding: 24, marginTop: 24 }}>
          <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <TrendingUpIcon size={16} /> Risk Score Trend
          </h4>
          <div className="trend-chart-container">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="trend-chart-svg"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((v) => {
                const y = padding.top + plotH - v * plotH;
                return (
                  <g key={v}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={padding.left + plotW}
                      y2={y}
                      stroke="var(--border)"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      fill="var(--text-muted)"
                      fontSize="10"
                      fontFamily="inherit"
                    >
                      {Math.round(v * 100)}%
                    </text>
                  </g>
                );
              })}

              {/* Threshold lines */}
              <line
                x1={padding.left}
                y1={padding.top + plotH - 0.7 * plotH}
                x2={padding.left + plotW}
                y2={padding.top + plotH - 0.7 * plotH}
                stroke="var(--danger)"
                strokeDasharray="6 3"
                opacity={0.4}
              />
              <line
                x1={padding.left}
                y1={padding.top + plotH - 0.4 * plotH}
                x2={padding.left + plotW}
                y2={padding.top + plotH - 0.4 * plotH}
                stroke="var(--warning)"
                strokeDasharray="6 3"
                opacity={0.3}
              />

              {/* Area fill */}
              {validPoints.length > 1 && (
                <polygon
                  points={`${padding.left + (validPoints[0].i / Math.max(dayLabels.length - 1, 1)) * plotW},${padding.top + plotH} ${polylinePoints} ${padding.left + (validPoints[validPoints.length - 1].i / Math.max(dayLabels.length - 1, 1)) * plotW},${padding.top + plotH}`}
                  fill="url(#areaGradient)"
                />
              )}

              {/* Line */}
              {validPoints.length > 1 && (
                <polyline
                  points={polylinePoints}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data points */}
              {validPoints.map(({ i, score }) => {
                const x = padding.left + (i / Math.max(dayLabels.length - 1, 1)) * plotW;
                const y = padding.top + plotH - score * plotH;
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r="5" fill="var(--bg-primary)" stroke={severityColor(score)} strokeWidth="2.5" />
                    <title>{dayLabels[i]}: {Math.round(score * 100)}% risk</title>
                  </g>
                );
              })}

              {/* X-axis labels */}
              {xLabels.map((label) => {
                const idx = dayLabels.indexOf(label);
                const x = padding.left + (idx / Math.max(dayLabels.length - 1, 1)) * plotW;
                const d = new Date(label);
                const formatted = `${d.getDate()}/${d.getMonth() + 1}`;
                return (
                  <text
                    key={label}
                    x={x}
                    y={chartH - 5}
                    textAnchor="middle"
                    fill="var(--text-muted)"
                    fontSize="10"
                    fontFamily="inherit"
                  >
                    {formatted}
                  </text>
                );
              })}

              {/* Gradient def */}
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Legend */}
          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-dot" style={{ background: "var(--danger)" }} />
              High risk (≥70%)
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: "var(--warning)" }} />
              Moderate (≥40%)
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: "var(--success)" }} />
              Low risk
            </span>
          </div>
        </div>
      ) : null}

      {/* Daily Scan Volume */}
      {totalScans > 0 && (
        <div className="glass-card" style={{ padding: 24, marginTop: 24 }}>
          <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <SearchIcon size={16} /> Daily Scan Volume
          </h4>
          <div className="trend-chart-container">
            <svg
              viewBox={`0 0 ${chartW} 140`}
              className="trend-chart-svg"
              preserveAspectRatio="xMidYMid meet"
            >
              {dailyCounts.map((count, i) => {
                const maxCount = Math.max(...dailyCounts, 1);
                const barW = Math.max((plotW / dayLabels.length) - 2, 3);
                const barH = (count / maxCount) * 100;
                const x = padding.left + (i / Math.max(dayLabels.length - 1, 1)) * plotW - barW / 2;
                const y = 110 - barH;
                return (
                  <g key={i}>
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      rx={2}
                      fill={count > 0 ? "var(--accent)" : "transparent"}
                      opacity={0.7}
                    />
                    {count > 0 && (
                      <title>{dayLabels[i]}: {count} scan{count > 1 ? "s" : ""}</title>
                    )}
                  </g>
                );
              })}

              {/* X-axis labels */}
              {xLabels.map((label) => {
                const idx = dayLabels.indexOf(label);
                const x = padding.left + (idx / Math.max(dayLabels.length - 1, 1)) * plotW;
                const d = new Date(label);
                const formatted = `${d.getDate()}/${d.getMonth() + 1}`;
                return (
                  <text
                    key={label}
                    x={x}
                    y={130}
                    textAnchor="middle"
                    fill="var(--text-muted)"
                    fontSize="10"
                    fontFamily="inherit"
                  >
                    {formatted}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      <div className="trends-bottom-grid">
        {/* Entity Frequency Breakdown */}
        {entityFreq.length > 0 && (
          <div className="glass-card" style={{ padding: 24 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
              <BarChartIcon size={16} /> Top Entity Types
            </h4>
            <div className="entity-freq-list">
              {entityFreq.slice(0, 8).map(([type, count]) => {
                const pct = Math.round((count / maxEntityCount) * 100);
                return (
                  <div key={type} className="entity-freq-row">
                    <div className="entity-freq-label">
                      <span style={{ textTransform: "capitalize", fontWeight: 600, fontSize: 13 }}>
                        {type.replace(/_/g, " ")}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {count}×
                      </span>
                    </div>
                    <div className="entity-freq-bar-bg">
                      <div
                        className="entity-freq-bar-fill"
                        style={{
                          width: `${pct}%`,
                          background: pct >= 80 ? "var(--danger)" : pct >= 50 ? "var(--warning)" : "var(--accent)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recurring Patterns & Insights */}
        {patterns.length > 0 && (
          <div className="glass-card" style={{ padding: 24 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangleIcon size={16} /> Insights & Patterns
            </h4>
            <div className="insights-list">
              {patterns.map((msg, i) => (
                <div key={i} className="insight-item">
                  <div className="insight-dot" />
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Empty State */}
      {totalScans === 0 && (
        <div className="glass-card empty-state" style={{ marginTop: 32 }}>
          <div className="icon">
            <TrendingUpIcon size={48} color="var(--text-muted)" />
          </div>
          <h3>No Trend Data Yet</h3>
          <p>
            Start scanning files to see your privacy risk trends, entity frequency
            breakdown, and behavioral insights over time.
          </p>
        </div>
      )}
    </div>
  );
}
