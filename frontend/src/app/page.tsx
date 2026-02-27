"use client";

import { useSession } from "@/lib/auth-client";
import Link from "next/link";

export default function HomePage() {
  const { data: session } = useSession();

  return (
    <div className="landing-page">
      {/* Navbar */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-logo">
            <span className="landing-logo-icon">🛡️</span>
            <span className="landing-logo-text">PixelGuard</span>
          </div>
          <div className="landing-nav-links">
            {session ? (
              <Link href="/dashboard" className="btn btn-primary btn-sm">
                Dashboard →
              </Link>
            ) : (
              <>
                <Link href="/auth/signin" className="btn btn-secondary btn-sm">
                  Sign In
                </Link>
                <Link href="/auth/signup" className="btn btn-primary btn-sm">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-glow-2" />
        <div className="hero-content fade-in">
          <div className="hero-badge">
            <span>🔒</span> AI-Powered Privacy Engine
          </div>
          <h1 className="hero-title">
            Protect Sensitive Data
            <br />
            <span className="hero-gradient">Before It Leaks</span>
          </h1>
          <p className="hero-desc">
            PixelGuard scans your images, documents, and audio for credit cards,
            Aadhaar numbers, phone numbers, and more — then flags, warns, or
            auto-redacts before you share.
          </p>
          <div className="hero-actions">
            <Link
              href={session ? "/dashboard" : "/auth/signup"}
              className="btn btn-primary"
              style={{ padding: "14px 36px", fontSize: 15 }}
            >
              🚀 Start Scanning Free
            </Link>
            <a
              href="#features"
              className="btn btn-secondary"
              style={{ padding: "14px 36px", fontSize: 15 }}
            >
              Learn More ↓
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="hero-stats fade-in">
          <div className="stat-item">
            <div className="stat-value">18+</div>
            <div className="stat-label">PII Types Detected</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">4</div>
            <div className="stat-label">Processing Modes</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">3</div>
            <div className="stat-label">Media Types</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">AI</div>
            <div className="stat-label">Context-Aware</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-section" id="features">
        <h2 className="section-title">
          Everything You Need for <span className="hero-gradient">Privacy Protection</span>
        </h2>
        <p className="section-desc">
          From detection to redaction — PixelGuard handles it all with
          contextual AI intelligence
        </p>

        <div className="features-grid">
          <div className="feature-card glass-card">
            <div className="feature-icon">📸</div>
            <h3>Image Scanning</h3>
            <p>
              OCR-powered text extraction with face detection. Finds credit
              cards, IDs, and sensitive text in your photos.
            </p>
          </div>
          <div className="feature-card glass-card">
            <div className="feature-icon">📄</div>
            <h3>Document Analysis</h3>
            <p>
              Layout-aware PDF extraction. Detects Aadhaar, SSN, bank accounts,
              UPI IDs, IFSC codes, and more.
            </p>
          </div>
          <div className="feature-card glass-card">
            <div className="feature-icon">🎙️</div>
            <h3>Audio Transcription</h3>
            <p>
              Whisper-powered speech-to-text. Flags PII spoken in voice
              messages, reels, and podcasts.
            </p>
          </div>
          <div className="feature-card glass-card">
            <div className="feature-icon">🧠</div>
            <h3>AI Context Engine</h3>
            <p>
              LLM-powered classification distinguishes a credit card from a
              tracking number. No blind redaction.
            </p>
          </div>
          <div className="feature-card glass-card">
            <div className="feature-icon">⚙️</div>
            <h3>Policy Builder</h3>
            <p>
              Enterprise-grade rules: always redact credit cards, only flag
              phone numbers, ignore names.
            </p>
          </div>
          <div className="feature-card glass-card">
            <div className="feature-icon">📋</div>
            <h3>Audit Trail</h3>
            <p>
              Every decision is logged with stage-by-stage reasoning.
              Compliance-ready audit trail.
            </p>
          </div>
        </div>
      </section>

      {/* Modes */}
      <section className="landing-section">
        <h2 className="section-title">
          Four <span className="hero-gradient">Processing Modes</span>
        </h2>
        <p className="section-desc">
          Choose how aggressive you want your privacy protection to be
        </p>

        <div className="modes-row">
          <div className="mode-card glass-card">
            <span className="mode-card-icon">🟢</span>
            <h4>Flag Only</h4>
            <p>Detect & report sensitive items. No modifications.</p>
          </div>
          <div className="mode-card glass-card">
            <span className="mode-card-icon">🟡</span>
            <h4>Warn & Recommend</h4>
            <p>Flag items and suggest what to redact.</p>
          </div>
          <div className="mode-card glass-card">
            <span className="mode-card-icon">🔴</span>
            <h4>Auto Redact</h4>
            <p>Automatically mask, blur, or bleep sensitive content.</p>
          </div>
          <div className="mode-card glass-card">
            <span className="mode-card-icon">⚫</span>
            <h4>Policy Enforced</h4>
            <p>Enterprise rules for granular control.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-cta">
        <div className="cta-card glass-card">
          <h2>Ready to protect your content?</h2>
          <p>
            Start scanning images, documents, and audio for sensitive data in
            seconds.
          </p>
          <Link
            href={session ? "/dashboard" : "/auth/signup"}
            className="btn btn-primary"
            style={{ padding: "14px 40px", fontSize: 15 }}
          >
            🛡️ Get Started — It&apos;s Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-logo">
          <span className="landing-logo-icon">🛡️</span>
          <span className="landing-logo-text">PixelGuard</span>
        </div>
        <p>AI-powered privacy detection & redaction engine</p>
      </footer>
    </div>
  );
}
