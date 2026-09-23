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
  Network,
  Activity,
  Gauge,
  Layers,
  Crown,
  Coins,
  Terminal,
  Users,
  Receipt,
} from "lucide-react";

const searchableItems = [
  { title: "Overview Dashboard", category: "Navigation", href: "/", keywords: "overview stats metrics traffic analytics" },
  { title: "API Keys Management", category: "Navigation", href: "/keys", keywords: "api keys token secrets generate revoke 30 rpm" },
  { title: "Logs & Usage History", category: "Navigation", href: "/logs", keywords: "logs usage history requests latency latency status errors" },
  { title: "AI Models & Pricing", category: "Navigation", href: "/models", keywords: "models pricing cost tokens gpt-5.2 gpt-5.5 claude opus sonnet" },
  { title: "Subscription & Billing", category: "Navigation", href: "/billing", keywords: "billing token balance credits buy payment qris virtual account invoice subscription plus pro ultra" },
  { title: "Account Settings", category: "Navigation", href: "/settings", keywords: "settings profile email password security" },
  { title: "GPT-5.2 Core Model", category: "AI Models", href: "/models", keywords: "gpt-5.2 openai 128k prompt cost" },
  { title: "GPT-5.5 Ultra Model", category: "AI Models", href: "/models", keywords: "gpt-5.5 openai 256k ultra" },
  { title: "GPT-5.6 Luna Multimodal", category: "AI Models", href: "/models", keywords: "gpt-5.6-luna luna 512k multimodal" },
  { title: "Claude 4.6 Opus Model", category: "AI Models", href: "/models", keywords: "claude-opus-4.6 anthropic 200k opus" },
  { title: "Claude 5 Fable Reasoning", category: "AI Models", href: "/models", keywords: "claude-fable-5 fable anthropic 200k" },
  { title: "Claude 5 Sonnet Model", category: "AI Models", href: "/models", keywords: "claude-sonet-5 sonnet anthropic 200k" },
  { title: "Endpoint /v1/chat/completions", category: "Endpoints", href: "/logs?filter=/v1/chat/completions", keywords: "chat completions stream proxy endpoint" },
  { title: "Endpoint /v1/models", category: "Endpoints", href: "/logs?filter=/v1/models", keywords: "models list api" },
  { title: "Admin Overview Dashboard", category: "Admin", href: "/admin", keywords: "admin overview dashboard providers health upstream" },
  { title: "Provider Connections", category: "Admin", href: "/admin/providers", keywords: "providers connections openai anthropic google openrouter accounts" },
  { title: "Subscriptions & Access Matrix", category: "Admin", href: "/admin/subscriptions", keywords: "admin subscriptions tiers matrix access models free plus pro ultra limits" },
  { title: "Realtime Upstream Usage", category: "Admin", href: "/admin/usage", keywords: "realtime usage upstream sse stream live tokens" },
  { title: "Admin Console Logs", category: "Admin", href: "/admin/logs", keywords: "console logs admin stream terminal live fallback token refresh" },
  { title: "Promo Discounts Control", category: "Admin", href: "/admin/discounts", keywords: "promo discounts flash sale loyalty first topup" },
  { title: "Quota Tracker", category: "Admin", href: "/admin/quota", keywords: "quota tracker limits api usage remaining reset countdown balance" },
  { title: "Combo Models & Auto-Rotate", category: "Admin", href: "/admin/combos", keywords: "combo models auto-rotate fallback round-robin tiered failover multi-account" },
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
          { title: "Admin User Management", category: "Admin", href: "/admin/users", keywords: "admin users accounts daftar user tier credits inject balance pelanggan" },
          { title: "Admin Transaksi & Order", category: "Admin", href: "/admin/orders", keywords: "admin orders transactions transaksi pembayaran approve manual bayar pesanan qris va" },
          { title: "Admin Discount Control", category: "Admin", href: "/admin/discounts", keywords: "admin discounts flash sale promo loyalty" },
          { title: "Admin Models Management", category: "Admin", href: "/admin/models", keywords: "admin models crud add edit delete pricing" },
          { title: "Combo Models & Auto-Rotate", category: "Admin", href: "/admin/combos", keywords: "admin combo models auto rotate fallback round robin tiered failover" },
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
    { label: "Subscription & Billing", href: "/billing", icon: CreditCard },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  const adminNavItems = [
    { label: "Admin Overview", href: "/admin", icon: LayoutDashboard },
    { label: "Daftar Pengguna", href: "/admin/users", icon: Users },
    { label: "Transaksi & Order", href: "/admin/orders", icon: Receipt },
    { label: "Subscriptions", href: "/admin/subscriptions", icon: Crown },
    { label: "Providers", href: "/admin/providers", icon: Network },
    { label: "Quota Tracker", href: "/admin/quota", icon: Gauge },
    { label: "Realtime Usage", href: "/admin/usage", icon: Activity },
    { label: "Console Logs", href: "/admin/logs", icon: Terminal },
    { label: "AI Models", href: "/admin/models", icon: Boxes },
    { label: "Combo Models", href: "/admin/combos", icon: Layers },
    { label: "Promo Discounts", href: "/admin/discounts", icon: Flame },
    { label: "Support Tickets", href: "/admin/tickets", icon: LifeBuoy },
    { label: "Payment Gateway", href: "/admin/payment", icon: CreditCard },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="Aidev Gateway Logo" className="brand-logo-img" />
          <div className="brand-text">
            <strong>Aidev Gateway</strong>
            <small>High-Performance AI Proxy</small>
          </div>
        </div>

        <div className="sidebar-nav-container">
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
                    const isActive =
                      pathname === href ||
                      (href !== "/admin" && pathname.startsWith(href + "/"));
                    return (
                      <Link
                        className={"nav-item admin-nav-item " + (isActive ? "active" : "")}
                        href={href}
                        key={label}
                      >
                        <Icon className="nav-icon" size={15} strokeWidth={1.5} />
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
                ? "Subscription & Billing"
                : pathname === "/admin/subscriptions"
                ? "Subscriptions & Access"
                : pathname === "/docs"
                ? "Documentation"
                : pathname === "/support"
                ? "Support & Help"
                : pathname === "/changelog"
                ? "Changelog"
                : pathname === "/admin"
                ? "Admin Overview"
                : pathname === "/admin/quota"
                ? "Quota Tracker"
                : pathname === "/admin/models"
                ? "Admin Models Management"
                : pathname === "/settings"
                ? "Account Settings"
                : pathname.startsWith("/admin/providers")
                ? "Provider Connections"
                : pathname === "/admin/usage"
                ? "Realtime Upstream Usage"
                : pathname === "/admin/logs"
                ? "Admin Console Logs"
                : pathname === "/admin/discounts"
                ? "Promo Discounts"
                : pathname === "/admin/combos"
                ? "Combo Models & Auto-Rotate"
                : pathname === "/admin/users"
                ? "Daftar Pengguna"
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
            {currentUser && (
              <Link
                href="/billing"
                className="topbar-credit-pill"
                title={`Saldo: ${Number(currentUser.creditBalance ?? 0).toLocaleString("id-ID")} Credits | Tier: ${currentUser.subscriptionTier || "FREE"} (Klik untuk kelola billing)`}
              >
                <Coins size={13} className="topbar-credit-icon" />
                <span className="topbar-credit-val">
                  {Number(currentUser.creditBalance ?? 0).toLocaleString("id-ID")}
                  <span className="topbar-credit-unit">CR</span>
                </span>
                <span className="topbar-credit-divider" />
                <span
                  className={`topbar-tier-tag ${
                    currentUser.subscriptionTier === "ULTRA"
                      ? "tier-ultra"
                      : currentUser.subscriptionTier === "PRO"
                      ? "tier-pro"
                      : currentUser.subscriptionTier === "PLUS"
                      ? "tier-plus"
                      : "tier-free"
                  }`}
                >
                  {currentUser.subscriptionTier || "FREE"}
                </span>
              </Link>
            )}

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

        {/* Low Balance Warning Banner */}
        {currentUser && (Number(currentUser.creditBalance ?? 0) <= 20000 && Number(currentUser.tokenBalance ?? 0) <= 500000) && (
          <div className="low-token-banner">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-500 shrink-0" />
              <span className="text-xs">
                <strong>Peringatan Kuota Menipis:</strong> Sisa saldo kredit Anda saat ini adalah{" "}
                <span className="mono font-semibold">
                  {Number(currentUser.creditBalance ?? 0).toLocaleString()} Credits
                </span>
                . Segera lakukan top-up ketengan atau upgrade paket langganan agar layanan AI tidak terputus.
              </span>
            </div>
            <Link href="/billing" className="low-token-btn">
              <span>Top Up / Upgrade</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        )}

        {children}
      </main>
    </div>
  );
}
