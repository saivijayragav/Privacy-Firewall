"use client";

import { useState, useRef, useEffect } from "react";
import { BrainIcon, SendIcon, PaperclipIcon, XIcon, FileTextIcon, ImageIcon, MusicIcon } from "@/components/Icons";
import { chatWithAgent, type ChatMessage } from "@/lib/api";

type UIMessage = ChatMessage & {
  has_sensitive_data?: boolean;
  risk_score?: number;
  flagged_entities?: Array<{
    detected: { type: string; raw_value: string };
    contextual: { severity_level: string; confidence_score: number; reasoning: string };
  }>;
};

export default function ChatbotPage() {
  const [messages, setMessages] = useState<UIMessage[]>([
    { role: "assistant", content: "Hi! I am the PixelGuard Privacy Assistant. You can ask me questions about data privacy, or attach a file and I will analyze it for sensitive information." }
  ]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if ((!input.trim() && !file) || loading) return;

    let userContent = input.trim();
    if (file && !userContent) {
      userContent = `Please analyze this file: ${file.name}`;
    } else if (file) {
      userContent = `[Attached: ${file.name}] ${userContent}`;
    }

    const newMessages: UIMessage[] = [
      ...messages,
      { role: "user", content: userContent }
    ];
    
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Send only previous messages as history
      const historyMsg = messages.map(m => ({ role: m.role, content: m.content }));
      
      const res = await chatWithAgent({
        message: input.trim() || `Please analyze this file: ${file?.name}`,
        chat_history: historyMsg,
        file: file || undefined,
        use_llm: true
      });

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: res.reply,
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="dashboard-content fade-in" style={{ height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
      <div className="dashboard-header-text">
        <h2 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <BrainIcon size={28} color="var(--primary)" />
          AI Privacy Assistant
        </h2>
        <p>Ask questions or analyze documents conversationally.</p>
      </div>

      <div className="glass-card" style={{ flex: 1, display: "flex", flexDirection: "column", marginTop: "20px", overflow: "hidden", padding: 0 }}>
        {/* Chat Messages Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", gap: "12px", alignItems: "flex-start" }}>
              <div style={{ 
                width: "36px", height: "36px", borderRadius: "50%", 
                backgroundColor: msg.role === "user" ? "var(--primary)" : "var(--accent)",
                display: "flex", alignItems: "center", justifyContent: "center", color: "white", flexShrink: 0
              }}>
                {msg.role === "user" ? "U" : <BrainIcon size={20} color="white" />}
              </div>
              <div style={{ 
                maxWidth: "75%", 
                padding: "16px",
                borderRadius: "16px",
                borderTopRightRadius: msg.role === "user" ? "4px" : "16px",
                borderTopLeftRadius: msg.role === "assistant" ? "4px" : "16px",
                backgroundColor: msg.role === "user" ? "var(--primary)" : "var(--surface)",
                color: msg.role === "user" ? "white" : "var(--text-primary)",
                border: msg.role === "assistant" ? "1px solid var(--border)" : "none",
                whiteSpace: "pre-wrap",
                lineHeight: "1.5"
              }}>
                {msg.content}
                
                {/* Render inline scan results if any */}
                {msg.flagged_entities && msg.flagged_entities.length > 0 && (
                  <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--danger)", marginBottom: "8px" }}>
                      ⚠️ Found {msg.flagged_entities.length} Sensitive Entities
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {msg.flagged_entities.slice(0, 5).map((e, idx) => (
                        <span key={idx} style={{ padding: "4px 8px", backgroundColor: "var(--background)", border: "1px solid var(--border)", borderRadius: "4px", fontSize: "0.75rem" }}>
                          {e.detected.type.replace("_", " ")}
                        </span>
                      ))}
                      {msg.flagged_entities.length > 5 && (
                        <span style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          +{msg.flagged_entities.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", flexShrink: 0 }}>
                <BrainIcon size={20} color="white" />
              </div>
              <div style={{ padding: "16px", borderRadius: "16px", borderTopLeftRadius: "4px", backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", gap: "4px" }}>
                  <span className="dot-typing" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="dot-typing" style={{ animationDelay: "200ms" }}>.</span>
                  <span className="dot-typing" style={{ animationDelay: "400ms" }}>.</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* File Attachment Preview */}
        {file && (
          <div style={{ padding: "12px 24px", display: "flex", gap: "12px", alignItems: "center", borderTop: "1px solid var(--border)", backgroundColor: "rgba(14, 165, 233, 0.05)" }}>
            {file.type.startsWith("image/") ? <ImageIcon size={20} color="var(--primary)" /> : 
             file.type.startsWith("audio/") ? <MusicIcon size={20} color="var(--primary)" /> : 
             <FileTextIcon size={20} color="var(--primary)" />}
            <span style={{ fontSize: "0.9rem", flex: 1, color: "var(--text-primary)" }}>{file.name}</span>
            <button onClick={() => setFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "4px" }}>
              <XIcon size={16} />
            </button>
          </div>
        )}

        {/* Input Area */}
        <div style={{ padding: "20px", borderTop: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: "none" }} 
              onChange={(e) => {
                if (e.target.files?.[0]) setFile(e.target.files[0]);
              }}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: "12px", background: "none", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", height: "48px" }}
              title="Attach File"
            >
              <PaperclipIcon size={20} />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message the Privacy Assistant..."
              style={{
                flex: 1,
                minHeight: "48px",
                maxHeight: "150px",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--background)",
                color: "var(--text-primary)",
                resize: "none",
                fontFamily: "inherit",
                fontSize: "0.95rem"
              }}
              disabled={loading}
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={loading || (!input.trim() && !file)}
              style={{
                padding: "0 20px",
                height: "48px",
                backgroundColor: (loading || (!input.trim() && !file)) ? "var(--border)" : "var(--primary)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: (loading || (!input.trim() && !file)) ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background-color 0.2s"
              }}
            >
              <SendIcon size={18} />
            </button>
          </div>
          <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "12px" }}>
            The AI assistant may make mistakes. Always verify redactions.
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
      `}} />
    </div>
  );
}
