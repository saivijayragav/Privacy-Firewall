"use client";

import { signOut, useSession } from "@/lib/auth-client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", icon: "📤", label: "Upload & Scan" },
  { href: "/dashboard/history", icon: "📋", label: "Scan History" },
  { href: "/dashboard/policy", icon: "⚙️", label: "Policy Builder" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/auth/signin");
    }
  }, [session, isPending, router]);

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

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="icon">🛡️</div>
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
          <button
            className="logout-btn"
            title="Sign out"
            onClick={async () => {
              await signOut();
              router.push("/auth/signin");
            }}
          >
            🚪
          </button>
        </div>
      </aside>

      <main className="main-content fade-in">{children}</main>
    </div>
  );
}
