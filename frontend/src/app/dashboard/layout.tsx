"use client";

import { signOut, useSession } from "@/lib/auth-client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ShieldIcon,
  UploadIcon,
  ClipboardIcon,
  SettingsIcon,
  LogOutIcon,
  MenuIcon,
  XIcon,
  TrendingUpIcon,
  BrainIcon,
} from "@/components/Icons";

const NAV_ITEMS = [
  { href: "/dashboard", icon: <UploadIcon size={18} />, label: "Upload & Scan" },
  { href: "/dashboard/history", icon: <ClipboardIcon size={18} />, label: "Scan History" },
  { href: "/dashboard/policy", icon: <SettingsIcon size={18} />, label: "Policy Builder" },
  { href: "/dashboard/trends", icon: <TrendingUpIcon size={18} />, label: "Trends" },
  { href: "/dashboard/chatbot", icon: <BrainIcon size={18} />, label: "AI Assistant" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!isPending && !session && !loggingOut) {
      router.replace("/auth/signin");
    }
  }, [session, isPending, router, loggingOut]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (isPending) {
    return (
      <div className="auth-container">
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  if (!session) return null;

  const initials =
    session.user.name
      ?.split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  const handleSignOut = async () => {
    setLoggingOut(true);
    await signOut();
    router.push("/");
  };

  const getBreadcrumbTitle = () => {
    switch (pathname) {
      case "/dashboard": return "Upload & Scan";
      case "/dashboard/history": return "Scan History";
      case "/dashboard/policy": return "Policy Builder";
      case "/dashboard/trends": return "Trends";
      case "/dashboard/chatbot": return "AI Assistant";
      default: return "Upload & Scan";
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <div className="icon" style={{ background: "transparent", padding: 0 }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="shieldGrad" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
                <linearGradient id="glow" x1="16" y1="8" x2="16" y2="24" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
                </linearGradient>
                <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <path d="M16 2.5L3.5 7.2V14.8C3.5 21.6 8.8 28 16 30.5C23.2 28 28.5 21.6 28.5 14.8V7.2L16 2.5Z" fill="url(#shieldGrad)" />
              <path d="M16 2.5L3.5 7.2V14.8C3.5 21.6 8.8 28 16 30.5C23.2 28 28.5 21.6 28.5 14.8V7.2L16 2.5Z" fill="url(#glow)" fillOpacity="0.8" />
              <path d="M16 4.5L5.5 8.5V14.8C5.5 20.2 9.4 25.1 16 27.2C22.6 25.1 26.5 20.2 26.5 14.8V8.5L16 4.5Z" fill="#060b18" fillOpacity="0.9" />
              <path d="M16 8V23C12 21 9 17 9 13.5V10.5L16 8Z" fill="#38bdf8" opacity="0.15" />
              <path d="M22 13.5L14 21.5L10 17.5" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#neonGlow)" />
            </svg>
          </div>
          <h1>PixelGuard</h1>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${pathname === item.href ? "active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{initials}</div>
          <div className="user-info" style={{ flex: 1 }}>
            <p>{session.user.name}</p>
            <span>{session.user.email}</span>
          </div>
        </div>
      </aside>

      <main className="main-content fade-in">
        {/* Dashboard Header */}
        <div className="dashboard-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "32px" }}>
          <div className="dashboard-header-left" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", letterSpacing: "0.02em" }}>
              <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>PixelGuard</span>
              <span style={{ color: "rgba(255,255,255,0.15)" }}>/</span>
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>{getBreadcrumbTitle()}</span>
            </div>
          </div>
          <div className="dashboard-header-right" style={{ display: "flex", alignItems: "center" }}>
            <button onClick={handleSignOut} style={{ 
              display: "flex", alignItems: "center", gap: "6px", 
              background: "transparent", border: "1px solid rgba(255,255,255,0.1)", 
              padding: "6px 12px", borderRadius: "6px", color: "var(--text-secondary)", 
              fontSize: "13px", cursor: "pointer", transition: "all 0.2s" 
            }}
            onMouseOver={(e) => e.currentTarget.style.color = "white"}
            onMouseOut={(e) => e.currentTarget.style.color = "var(--text-secondary)"}
            >
              <LogOutIcon size={14} /> Sign Out
            </button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
