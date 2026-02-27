"use client";

import React, { useState } from "react";
import { ScanResponse } from "@/lib/api";
import { CheckCircleIcon, EditIcon } from "./Icons";

interface Props {
  file: File;
  scanResult: ScanResponse;
  onRedact: (approvedIds: string[], manualRegions: []) => void;
  onCancel: () => void;
}

export function ListRedactionEditor({ file, scanResult, onRedact, onCancel }: Props) {
  const [approvedIds, setApprovedIds] = useState<Set<string>>(
    new Set(scanResult.flagged_entities.map((e) => e.detected.entity_id))
  );

  const toggleEntity = (id: string) => {
    const newApproved = new Set(approvedIds);
    if (newApproved.has(id)) {
      newApproved.delete(id);
    } else {
      newApproved.add(id);
    }
    setApprovedIds(newApproved);
  };

  return (
    <div className="glass-card" style={{ padding: 24, marginTop: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <EditIcon size={20} /> Review & Redact ({file.name})
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          Select the items you want to keep redacted before finalizing the document.
        </p>
      </div>

      <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
        <table className="entity-table" style={{ width: "100%", margin: 0 }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--bg-secondary)", zIndex: 10 }}>
            <tr>
              <th style={{ width: 40, textAlign: "center" }}>
                ✓
              </th>
              <th>Type</th>
              <th>Detected Value</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody>
            {scanResult.flagged_entities.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-muted)" }}>
                  No sensitive entities found to review.
                </td>
              </tr>
            )}
            {scanResult.flagged_entities.map((fe) => {
              const id = fe.detected.entity_id;
              const isChecked = approvedIds.has(id);
              return (
                <tr 
                  key={id} 
                  onClick={() => toggleEntity(id)}
                  style={{ cursor: "pointer", background: isChecked ? "rgba(239, 68, 68, 0.04)" : "transparent" }}
                >
                  <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                    <input 
                      type="checkbox" 
                      checked={isChecked} 
                      readOnly 
                      style={{ accentColor: "var(--danger)", cursor: "pointer", width: 16, height: 16 }} 
                    />
                  </td>
                  <td style={{ fontWeight: 600, textTransform: "capitalize" }}>
                    {fe.detected.type.replace(/_/g, " ")}
                  </td>
                  <td>
                    <code style={{ background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>
                      {fe.detected.raw_value.length > 40
                        ? fe.detected.raw_value.slice(0, 40) + "…"
                        : fe.detected.raw_value}
                    </code>
                  </td>
                  <td>
                    <span className={`badge badge-${fe.contextual.severity_level}`}>
                      {fe.contextual.severity_level}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => onRedact(Array.from(approvedIds), [])}>
          <CheckCircleIcon size={16} /> Confirm & Redact
        </button>
      </div>
    </div>
  );
}
