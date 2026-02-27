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
} from "@/components/Icons";

const NAV_ITEMS = [
  { href: "/dashboard", icon: <UploadIcon size={18} />, label: "Upload & Scan" },
  { href: "/dashboard/history", icon: <ClipboardIcon size={18} />, label: "Scan History" },
  { href: "/dashboard/policy", icon: <SettingsIcon size={18} />, label: "Policy Builder" },
  { href: "/dashboard/trends", icon: <TrendingUpIcon size={18} />, label: "Trends" },
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

  return (
    <div className="dashboard-layout">
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <div className="icon"><ShieldIcon size={20} color="#0EA5E9" /></div>
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
          <div className="user-info">
            <p>{session.user.name}</p>
            <span>{session.user.email}</span>
          </div>
        </div>
      </aside>

      <main className="main-content fade-in">
        {/* Dashboard Header */}
        <div className="dashboard-header">
          <div className="dashboard-header-left">
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
            </button>
          </div>
          <div className="dashboard-header-right">
            <button className="header-signout-btn" onClick={handleSignOut}>
              <LogOutIcon size={16} />
              Sign Out
            </button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
