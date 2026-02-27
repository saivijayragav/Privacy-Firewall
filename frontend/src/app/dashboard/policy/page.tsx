"use client";

import { useState } from "react";

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

export default function PolicyPage() {
  const [alwaysRedact, setAlwaysRedact] = useState<string[]>([
    "credit_card",
    "aadhaar",
  ]);
  const [ignore, setIgnore] = useState<string[]>(["person_name"]);
  const [copied, setCopied] = useState(false);

  function toggleItem(list: string[], setList: (v: string[]) => void, item: string) {
    if (list.includes(item)) {
      setList(list.filter((i) => i !== item));
    } else {
      setList([...list, item]);
    }
  }

  const policyObj = {
    always_redact: alwaysRedact,
    ignore: ignore,
  };

  const policyJsonStr = JSON.stringify(policyObj, null, 2);

  function copyToClipboard() {
    navigator.clipboard.writeText(JSON.stringify(policyObj));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Entities available for each list (can't be in both)
  const availableForRedact = ALL_ENTITY_TYPES.filter((t) => !ignore.includes(t));
  const availableForIgnore = ALL_ENTITY_TYPES.filter((t) => !alwaysRedact.includes(t));

  return (
    <div>
      <div className="page-header">
        <h2>Policy Builder</h2>
        <p>Configure enterprise privacy policies for policy-driven mode</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          {/* Always redact */}
          <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
            <div className="policy-section">
              <h4>
                🔴 Always Redact
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 400,
                    color: "var(--text-muted)",
                    marginLeft: 8,
                  }}
                >
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
                    {alwaysRedact.includes(type) && (
                      <span className="remove">✕</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Ignore */}
          <div className="glass-card" style={{ padding: 24 }}>
            <div className="policy-section">
              <h4>
                ⚪ Ignore
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 400,
                    color: "var(--text-muted)",
                    marginLeft: 8,
                  }}
                >
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
                    {ignore.includes(type) && (
                      <span className="remove">✕</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* JSON Preview */}
        <div>
          <div className="glass-card" style={{ padding: 24, position: "sticky", top: 32 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h4 style={{ fontSize: 15, fontWeight: 700 }}>
                📝 Generated Policy JSON
              </h4>
              <button className="btn btn-secondary btn-sm" onClick={copyToClipboard}>
                {copied ? "✅ Copied!" : "📋 Copy"}
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

            <p
              style={{
                marginTop: 16,
                fontSize: 12,
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              Copy this JSON and paste it into the <strong>Policy JSON</strong>{" "}
              field on the Upload & Scan page when using <strong>Policy Enforced</strong>{" "}
              mode. Or use it programmatically via the <code>policy_json</code> form
              field.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
