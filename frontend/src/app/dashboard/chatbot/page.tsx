"use client";

import { useState, useRef, useEffect } from "react";
import { BrainIcon, ArrowUpIcon, PaperclipIcon, XIcon, FileTextIcon, ImageIcon, MusicIcon, DownloadIcon } from "@/components/Icons";
import { chatWithAgent, redactFile, type ChatMessage } from "@/lib/api";

type UIMessage = ChatMessage & {
  scan_id?: string;
  has_sensitive_data?: boolean;
  risk_score?: number;
  flagged_entities?: Array<{
    detected: { type: string; raw_value: string };
    contextual: { severity_level: string; confidence_score: number; reasoning: string };
  }>;
};

const SUGGESTED_PROMPTS = [
  "Is it safe to share a resume with my home address?",
  "Can I send a PDF invoice with bank account details?",
  "I want to share our marketing brochure with clients.",
  "My colleague wants me to forward a medical record.",
  "Can I share a contract that has employee salaries?",
  "Is it okay to send a passport scan over email?"
];

export default function ChatbotPage() {
  const [messages, setMessages] = useState<UIMessage[]>([
    { role: "assistant", content: "Hi! I'm your Privacy Assistant.\n\nDescribe the document or resource you want to share — I'll analyze it and tell you whether it's safe, what risks exist, and whether you need to redact anything first." }
  ]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Track redaction status per scan_id: "idle" | "loading" | downloadUrl
  const [redactStatus, setRedactStatus] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleRedactClick = async (scanId: string) => {
    try {
      setRedactStatus((prev) => ({ ...prev, [scanId]: "loading" }));
      const res = await redactFile({ scan_id: scanId });
      if (res.status === "success" && res.download_url) {
        setRedactStatus((prev) => ({ ...prev, [scanId]: res.download_url || "done" }));
      } else {
        setRedactStatus((prev) => ({ ...prev, [scanId]: "error" }));
      }
    } catch (err) {
      console.error("Redaction failed:", err);
      setRedactStatus((prev) => ({ ...prev, [scanId]: "error" }));
    }
  };

  const commitSend = async (text: string, attachedFile: File | null) => {
    if ((!text.trim() && !attachedFile) || loading) return;

    let userContent = text.trim();
    if (attachedFile && !userContent) {
      userContent = `Please analyze this file: ${attachedFile.name}`;
    } else if (attachedFile) {
      userContent = `[Attached: ${attachedFile.name}] ${userContent}`;
    }

    const newMessages: UIMessage[] = [
      ...messages,
      { role: "user", content: userContent }
    ];
    
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const historyMsg = messages.map(m => ({ role: m.role, content: m.content }));
      
      const res = await chatWithAgent({
        message: text.trim() || `Please analyze this file: ${attachedFile?.name}`,
        chat_history: historyMsg,
        file: attachedFile || undefined,
        use_llm: true
      });

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: res.reply,
          scan_id: res.scan_id,
          has_sensitive_data: res.has_sensitive_data,
          risk_score: res.risk_score,
          flagged_entities: res.flagged_entities
        }
      ]);
      setFile(null);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `**Error:** ${err.message || "Failed to contact the assistant."}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    commitSend(input, file);
  };

  const handlePromptClick = (prompt: string) => {
    commitSend(prompt, null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="dashboard-content fade-in" style={{ height: "calc(100vh - 100px)", display: "flex", flexDirection: "column" }}>
      <div className="dashboard-header-text" style={{ marginBottom: "24px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "24px", fontWeight: 700 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(14, 165, 233, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BrainIcon size={20} color="var(--accent)" />
          </div>
          AI Privacy Assistant
        </h2>
        <p style={{ marginTop: "4px", color: "var(--text-secondary)" }}>Ask whether a document is safe to share before sending it</p>
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 280px", gap: "32px", overflow: "hidden" }}>
        
        {/* Left Column: Chat Area */}
        <div style={{ 
          display: "flex", 
          flexDirection: "column", 
          backgroundColor: "var(--bg-primary)", // Matches main background for inset look
          border: "1px solid rgba(255, 255, 255, 0.05)",
          borderRadius: "16px",
          overflow: "hidden" 
        }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "row", gap: "16px", alignItems: "flex-start", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                
                {msg.role === "assistant" && (
                  <div style={{ 
                    width: "36px", height: "36px", borderRadius: "8px", 
                    backgroundColor: "rgba(14, 165, 233, 0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", flexShrink: 0
                  }}>
                    <BrainIcon size={18} />
                  </div>
                )}

                <div style={{ 
                  maxWidth: "85%", 
                  padding: "16px 20px",
                  borderRadius: "12px",
                  backgroundColor: msg.role === "user" ? "var(--bg-secondary)" : "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  border: msg.role === "user" ? "1px solid rgba(14, 165, 233, 0.2)" : "1px solid rgba(255, 255, 255, 0.05)",
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.6",
                  fontSize: "15px",
                  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)"
                }}>
                  {msg.content}
                  
                  {/* Render inline scan results if any */}
                  {msg.flagged_entities && msg.flagged_entities.length > 0 && (
                    <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--danger)", marginBottom: "8px" }}>
                        ⚠️ Found {msg.flagged_entities.length} Sensitive Entities
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
                        {msg.flagged_entities.slice(0, 5).map((e, idx) => (
                          <span key={idx} style={{ padding: "4px 8px", backgroundColor: "var(--bg-primary)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "4px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            {e.detected.type.replace(/_/g, " ")}
                          </span>
                        ))}
                        {msg.flagged_entities.length > 5 && (
                          <span style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            +{msg.flagged_entities.length - 5} more
                          </span>
                        )}
                      </div>

                      {/* Redaction CTA */}
                      {msg.scan_id && (
                        <div>
                          {redactStatus[msg.scan_id] === "loading" ? (
                            <button className="btn btn-secondary btn-sm" disabled style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Redacting...
                            </button>
                          ) : redactStatus[msg.scan_id] && redactStatus[msg.scan_id] !== "error" ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: "rgba(16, 185, 129, 0.1)", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                              <span style={{ color: "var(--success)", fontSize: "0.85rem", fontWeight: 600 }}>✅ Redaction Complete</span>
                              <a href={redactStatus[msg.scan_id]} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
                                <DownloadIcon size={14} /> Download Secure File
                              </a>
                            </div>
                          ) : (
                            <button 
                              className="btn btn-primary btn-sm" 
                              onClick={() => handleRedactClick(msg.scan_id!)}
                              style={{ display: "flex", alignItems: "center", gap: "6px" }}
                            >
                              Redact Document
                            </button>
                          )}
                          {redactStatus[msg.scan_id] === "error" && (
                            <div style={{ color: "var(--danger)", fontSize: "0.75rem", marginTop: "8px" }}>Failed to redact document. Please try again.</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {loading && (
              <div style={{ display: "flex", flexDirection: "row", gap: "16px", alignItems: "flex-start" }}>
                <div style={{ 
                  width: "36px", height: "36px", borderRadius: "8px", 
                  backgroundColor: "rgba(14, 165, 233, 0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", flexShrink: 0
                }}>
                  <BrainIcon size={18} />
                </div>
                <div style={{ 
                  padding: "16px 20px",
                  borderRadius: "12px",
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)"
                }}>
                  <div style={{ display: "flex", gap: "4px", color: "var(--text-secondary)" }}>
                    <span className="dot-typing" style={{ animationDelay: "0ms" }}>.</span>
                    <span className="dot-typing" style={{ animationDelay: "200ms" }}>.</span>
                    <span className="dot-typing" style={{ animationDelay: "400ms" }}>.</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area (Bottom of left container) */}
          <div style={{ padding: "0 24px 24px" }}>
            
            {/* File Attachment Preview */}
            {file && (
              <div style={{ 
                padding: "8px 16px", 
                marginBottom: "8px",
                display: "inline-flex", 
                gap: "8px", 
                alignItems: "center", 
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.1)", 
                backgroundColor: "var(--bg-secondary)" 
              }}>
                {file.type.startsWith("image/") ? <ImageIcon size={16} color="var(--accent)" /> : 
                 file.type.startsWith("audio/") ? <MusicIcon size={16} color="var(--accent)" /> : 
                 <FileTextIcon size={16} color="var(--accent)" />}
                <span style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>{file.name}</span>
                <button onClick={() => setFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex", padding: "2px" }}>
                  <XIcon size={14} />
                </button>
              </div>
            )}

            <div style={{ 
              display: "flex", 
              alignItems: "center",
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              padding: "8px 8px 8px 16px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
            }}>
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: "none" }} 
                onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]); }}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "4px" }}
                title="Attach File"
              >
                <PaperclipIcon size={20} />
              </button>
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the document you want to share..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  padding: "8px 12px",
                  fontSize: "0.95rem",
                  resize: "none",
                  outline: "none",
                  boxShadow: "none",
                  height: "40px",
                  lineHeight: "24px"
                }}
                disabled={loading}
              />

              <button 
                onClick={handleSend}
                disabled={loading || (!input.trim() && !file)}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  backgroundColor: (loading || (!input.trim() && !file)) ? "rgba(255, 255, 255, 0.05)" : "rgba(14, 165, 233, 0.15)",
                  color: (loading || (!input.trim() && !file)) ? "rgba(255, 255, 255, 0.3)" : "var(--accent)",
                  border: "none",
                  cursor: (loading || (!input.trim() && !file)) ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s"
                }}
              >
                <ArrowUpIcon size={18} />
              </button>
            </div>
            
            <div style={{ textAlign: "center", fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.3)", marginTop: "12px" }}>
              Press Enter to send · Shift+Enter for new line
            </div>
          </div>
        </div>

        {/* Right Column: Prompts Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "32px", overflowY: "auto", paddingRight: "4px" }}>
          
          <div>
            <h4 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "16px", textTransform: "uppercase" }}>
              Try Asking About:
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {SUGGESTED_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handlePromptClick(prompt)}
                  disabled={loading}
                  style={{
                    textAlign: "left",
                    padding: "14px 16px",
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    borderRadius: "12px",
                    color: "var(--text-secondary)",
                    fontSize: "0.85rem",
                    cursor: loading ? "default" : "pointer",
                    transition: "all 0.2s",
                    lineHeight: "1.4"
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.borderColor = "rgba(14, 165, 233, 0.3)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.05)";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div style={{ backgroundColor: "var(--bg-secondary)", borderRadius: "12px", padding: "20px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
            <h4 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.05em", color: "var(--accent)", marginBottom: "16px", textTransform: "uppercase" }}>
              What I Analyze
            </h4>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
              <li style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <span style={{ color: "var(--accent)", fontSize: "12px", marginTop: "2px" }}>●</span>
                Personal identifiers (SSN, passport, ID)
              </li>
              <li style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <span style={{ color: "var(--accent)", fontSize: "12px", marginTop: "2px" }}>●</span>
                Financial data (cards, bank accounts)
              </li>
            </ul>
          </div>

        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .dot-typing { animation: blink 1.4s infinite both; }
        @keyframes blink {
          0% { opacity: 0.2; }
          20% { opacity: 1; }
          100% { opacity: 0.2; }
        }
        
        /* Thin beautiful scrollbar */
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
      `}} />
    </div>
  );
}
