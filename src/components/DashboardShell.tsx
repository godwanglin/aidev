"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  KeyRound,
  ScrollText,
  Boxes,
  CreditCard,
  Settings,
  Search,
  Bell,
  Rocket,
  User,
  LogOut,
  Flame,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  LifeBuoy,
} from "lucide-react";

const searchableItems = [
  { title: "Overview Dashboard", category: "Navigation", href: "/", keywords: "overview stats metrics traffic analytics" },
  { title: "API Keys Management", category: "Navigation", href: "/keys", keywords: "api keys token secrets generate revoke 30 rpm" },
  { title: "Logs & Usage History", category: "Navigation", href: "/logs", keywords: "logs usage history requests latency latency status errors" },
  { title: "AI Models & Pricing", category: "Navigation", href: "/models", keywords: "models pricing cost tokens gpt-5.2 gpt-5.5 claude opus sonnet" },
  { title: "Token Billing & Top-Up", category: "Navigation", href: "/billing", keywords: "billing token balance buy payment qris virtual account invoice" },
  { title: "Account Settings", category: "Navigation", href: "/settings", keywords: "settings profile email password security" },
  { title: "GPT-5.2 Core Model", category: "AI Models", href: "/models", keywords: "gpt-5.2 openai 128k prompt cost" },
  { title: "GPT-5.5 Ultra Model", category: "AI Models", href: "/models", keywords: "gpt-5.5 openai 256k ultra" },
  { title: "GPT-5.6 Luna Multimodal", category: "AI Models", href: "/models", keywords: "gpt-5.6-luna luna 512k multimodal" },
  { title: "Claude 4.6 Opus Model", category: "AI Models", href: "/models", keywords: "claude-opus-4.6 anthropic 200k opus" },
  { title: "Claude 5 Fable Reasoning", category: "AI Models", href: "/models", keywords: "claude-fable-5 fable anthropic 200k" },
  { title: "Claude 5 Sonnet Model", category: "AI Models", href: "/models", keywords: "claude-sonet-5 sonnet anthropic 200k" },
  { title: "Endpoint /v1/chat/completions", category: "Endpoints", href: "/logs?filter=/v1/chat/completions", keywords: "chat completions stream proxy endpoint" },
  { title: "Endpoint /v1/models", category: "Endpoints", href: "/logs?filter=/v1/models", keywords: "models list api" },
];

export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Global Search Bar State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isAdmin =
    currentUser?.email === "admin@devportal.local" || currentUser?.role === "ADMIN";

  const allSearchable = [
    ...searchableItems,
    ...(isAdmin
      ? [
          { title: "Admin Discount Control", category: "Admin", href: "/admin", keywords: "admin discounts flash sale promo loyalty" },
          { title: "Admin Models Management", category: "Admin", href: "/admin/models", keywords: "admin models crud add edit delete pricing" },
        ]
      : []),
  ];

  const searchResults = searchQuery.trim()
    ? allSearchable.filter((item) =>
        `${item.title} ${item.category} ${item.keywords}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase().trim())
      )
    : [];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (searchResults.length > 0) {
      router.push(searchResults[0].href);
    } else {
      router.push(`/logs?filter=${encodeURIComponent(searchQuery.trim())}`);
    }
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  const handleSelectResult = (href: string) => {
    router.push(href);
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  const navItems = [
    { label: "Overview", href: "/", icon: LayoutDashboard },
    { label: "API Keys", href: "/keys", icon: KeyRound },
    { label: "Logs & Usage", href: "/logs", icon: ScrollText },
    { label: "Models & Pricing", href: "/models", icon: Boxes },
    { label: "Token Billing", href: "/billing", icon: CreditCard },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  const adminNavItems = [
    { label: "Promo Discounts", href: "/admin", icon: Flame },
    { label: "Manage AI Models", href: "/admin/models", icon: Boxes },
    { label: "Support Tickets", href: "/admin/tickets", icon: LifeBuoy },
    { label: "Payment Gateway", href: "/admin/payment", icon: CreditCard },
  ];

  return (
    <div className="shell">
      <aside className="sidebar flex flex-col justify-between">
        <div>
          <div className="brand">
            <img src="/logo.png" alt="Aidev Gateway Logo" className="brand-logo-img" />
            <div className="brand-text">
              <strong>Aidev Gateway</strong>
              <small>High-Performance AI Proxy</small>
            </div>
          </div>

          <nav>
            {/* General User Nav */}
            <div className="space-y-0.5">
              {navItems.map(({ label, href, icon: Icon }) => {
                const isActive =
                  href === "/"
                    ? pathname === "/"
                    : href !== "#" && pathname.startsWith(href) && !pathname.startsWith("/admin");
                return (
                  <Link
                    className={"nav-item " + (isActive ? "active" : "")}
                    href={href}
                    key={label}
                  >
                    <Icon className="nav-icon" size={15} strokeWidth={1.5} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Clear Divider and Generous Spacing for Admin Console */}
            {isAdmin && (
              <div className="admin-nav-section">
                <div className="admin-divider" />
                <div className="admin-header-label">
                  <span className="flex items-center gap-1 text-[#64748b]">
                    <ShieldCheck size={11} className="text-amber-500" />
                    <span>Admin Console</span>
                  </span>
                  <span className="admin-badge-pro">PRO</span>
                </div>
                <div className="space-y-0.5">
                  {adminNavItems.map(({ label, href, icon: Icon }) => {
                    const isActive = pathname === href;
                    return (
                      <Link
                        className={"nav-item admin-nav-item " + (isActive ? "active" : "")}
                        href={href}
                        key={label}
                      >
                        <Icon className="nav-icon text-amber-500" size={14} strokeWidth={1.5} />
                        <span>{label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </nav>
        </div>

        <div className="profile">
          <div className="profile-inner">
            <div className="profile-avatar">
              <User size={13} strokeWidth={1.75} />
            </div>
            <div className="profile-info">
              <span className="profile-name">
                {currentUser?.name || "Developer User"}
              </span>
              <span className="profile-role">
                {isAdmin ? "System Admin" : "User Account"}
              </span>
            </div>
            <button
              className="icon-btn-ghost ml-auto text-muted"
              onClick={handleLogout}
              title="Sign Out"
            >
              <LogOut size={12} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-crumb">Console</span>
            <span className="topbar-sep">/</span>
            <span className="topbar-page">
              {pathname === "/logs"
                ? "Logs & Usage"
                : pathname === "/keys"
                ? "API Keys"
                : pathname === "/models"
                ? "Models & Pricing"
                : pathname === "/billing"
                ? "Token Billing"
                : pathname === "/docs"
                ? "Documentation"
                : pathname === "/support"
                ? "Support & Help"
                : pathname === "/changelog"
                ? "Changelog"
                : pathname === "/admin"
                ? "Admin Discounts Control"
                : pathname === "/admin/models"
                ? "Admin Models Management"
                : pathname === "/settings"
                ? "Account Settings"
                : "Overview"}
            </span>
          </div>

          {/* Interactive Global Search Bar */}
          <div className="search-wrapper" ref={searchRef}>
            <form onSubmit={handleSearchSubmit} className="search">
              <Search size={13} strokeWidth={1.5} />
              <input
                suppressHydrationWarning
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Search resources, models, endpoints..."
              />
            </form>

            {/* Live Search Results Dropdown */}
            {isSearchOpen && searchQuery.trim() && (
              <div className="search-dropdown">
                <div className="search-dropdown-header">
                  <span>Search Results for &ldquo;{searchQuery}&rdquo;</span>
                  <span className="text-xs text-muted">Press Enter ↵</span>
                </div>
                <div className="search-results-list">
                  {searchResults.length === 0 ? (
                    <div
                      className="search-result-item"
                      onClick={() => handleSelectResult(`/logs?filter=${encodeURIComponent(searchQuery.trim())}`)}
                    >
                      <div className="flex items-center gap-2">
                        <ScrollText size={13} className="text-blue" />
                        <div>
                          <span className="search-item-title">Search &ldquo;{searchQuery}&rdquo; in Request Logs</span>
                          <span className="search-item-cat">Live Logs Filter</span>
                        </div>
                      </div>
                      <ArrowRight size={12} className="text-muted" />
                    </div>
                  ) : (
                    searchResults.map((item, index) => (
                      <div
                        key={index}
                        className="search-result-item"
                        onClick={() => handleSelectResult(item.href)}
                      >
                        <div>
                          <span className="search-item-title">{item.title}</span>
                          <span className="search-item-cat">{item.category}</span>
                        </div>
                        <ArrowRight size={12} className="text-muted" />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="links">
            <Link href="/docs">Docs</Link>
            <Link href="/support">Support</Link>
            <Link href="/changelog">Changelog</Link>
          </div>
          <div className="top-actions">
            {isAdmin && (
              <Link
                href="/admin"
                className="control btn-inline text-amber-500 font-semibold"
                title="Open Admin Control Panel"
              >
                <ShieldCheck size={13} />
                <span>Admin Panel</span>
              </Link>
            )}

            <button className="icon-btn" aria-label="Notifications" title="Notifications">
              <Bell size={14} strokeWidth={1.5} />
            </button>
            <Link href="/keys" className="deploy">
              <Rocket size={13} strokeWidth={1.75} />
              <span>Get API Key</span>
            </Link>
          </div>
        </header>

        {/* Low Token Warning Banner */}
        {currentUser && Number(currentUser.tokenBalance) <= 500000 && (
          <div className="low-token-banner">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-500 shrink-0" />
              <span className="text-xs">
                <strong>Peringatan Kuota Menipis:</strong> Sisa saldo token Anda saat ini adalah{" "}
                <span className="mono font-semibold">
                  {Number(currentUser.tokenBalance) < 0
                    ? `-${Math.abs(Number(currentUser.tokenBalance)).toLocaleString()} Tokens`
                    : `${Number(currentUser.tokenBalance).toLocaleString()} Tokens`}
                </span>
                . Segera lakukan top up agar layanan AI tidak terputus.
              </span>
            </div>
            <Link href="/billing" className="low-token-btn">
              <span>Top Up Sekarang</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        )}

        {children}
      </main>
    </div>
  );
}
