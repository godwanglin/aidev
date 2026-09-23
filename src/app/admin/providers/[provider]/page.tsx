"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";
import {
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Lock,
  Zap,
  Edit,
  Trash2,
  Plus,
  Copy,
  Check,
  Bot,
  Ban,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Play,
  X,
  FlaskConical,
  Eye,
  Brain,
  KeyRound,
  Download,
} from "lucide-react";
import {
  findProviderBySlugOrId,
  CatalogProviderItem,
  SHARED_PROVIDER_MODELS,
} from "@/lib/oauth/config";
import { getProviderPrefix } from "@/lib/model-normalizer";
import { renderProviderIcon, ProviderAvatar } from "@/components/providers/ProviderIcons";
import OAuthDarkModal from "@/components/providers/OAuthDarkModal";
import EditConnectionModal, { ConnectionItem } from "@/components/providers/EditConnectionModal";
import CustomDropdown from "@/components/CustomDropdown";

export default function ProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const providerSlug = (params?.provider as string) || "";

  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingConn, setEditingConn] = useState<ConnectionItem | null>(null);

  // Auto-ping states
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<Record<string, { latency: number; ok: boolean }>>({});
  const [copiedModel, setCopiedModel] = useState<string | null>(null);

  // Sequential testing one-by-one
  const [isTestingOneByOne, setIsTestingOneByOne] = useState(false);
  const [testingStep, setTestingStep] = useState<{ current: number; total: number } | null>(null);

  // Dynamic models pulling & manual add
  const [modelsList, setModelsList] = useState<{ id: string; name: string }[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isPullingModels, setIsPullingModels] = useState(false);
  const [modelsSource, setModelsSource] = useState<string>("CATALOG");
  const [showAddModelModal, setShowAddModelModal] = useState(false);
  const [newModelId, setNewModelId] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [addModelError, setAddModelError] = useState("");

  // Model test & delete state
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [modelTestResults, setModelTestResults] = useState<
    Record<string, { latency: number; ok: boolean; statusText?: string }>
  >({});
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);

  // Provider Settings
  const [roundRobinActive, setRoundRobinActive] = useState(false);
  const [allDisabled, setAllDisabled] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState("AUTO");

  // Resolve Provider metadata
  const catalogItem = useMemo(() => {
    return findProviderBySlugOrId(providerSlug);
  }, [providerSlug]);

  const providerMeta: CatalogProviderItem = useMemo(() => {
    if (catalogItem) return catalogItem;
    // Fallback for custom or unknown slug
    const cleanName = providerSlug
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      id: providerSlug.toUpperCase().replace(/[-_]/g, "_"),
      name: cleanName,
      slug: providerSlug,
      category: "CUSTOM",
      color: "#64748b",
      iconName: "Network",
      authType: "API_KEY",
    };
  }, [catalogItem, providerSlug]);

  // Custom Provider Specific States
  const [customProviderData, setCustomProviderData] = useState<{
    id: string;
    name: string;
    slug: string;
    prefix: string;
    apiType: string;
    baseUrl: string;
    compatibility: string;
  } | null>(null);
  const [isCustomProvider, setIsCustomProvider] = useState(false);

  // Add API Key Modal State (for Custom Provider)
  const [showAddKeyModal, setShowAddKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeySecret, setNewKeySecret] = useState("");
  const [newKeyPriority, setNewKeyPriority] = useState(1);
  const [isSavingKey, setIsSavingKey] = useState(false);

  // Edit Custom Provider Modal State
  const [showEditCustomModal, setShowEditCustomModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPrefix, setEditPrefix] = useState("");
  const [editApiType, setEditApiType] = useState("Chat Completions");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [isSavingCustom, setIsSavingCustom] = useState(false);

  // Quick inline model add & import from /models
  const [quickModelId, setQuickModelId] = useState("");
  const [isImportingModels, setIsImportingModels] = useState(false);

  // Normalized model routing prefix for this provider (e.g. "ag/", "cx/", "cc/", or "ipeenk/")
  const providerPrefix = useMemo(() => {
    if (customProviderData?.prefix) {
      return `${customProviderData.prefix.replace(/\/+$/, "")}/`;
    }
    return getProviderPrefix(providerMeta.id);
  }, [customProviderData, providerMeta.id]);

  // Fetch connections for this provider
  async function fetchConnections() {
    setLoading(true);
    try {
      // First check if this slug is a custom provider
      const cpRes = await fetch(`/api/admin/providers/custom/${providerSlug}`);
      if (cpRes.ok) {
        const cpJson = await cpRes.json();
        if (cpJson.success && cpJson.provider) {
          setIsCustomProvider(true);
          setCustomProviderData(cpJson.provider);
          setConnections(cpJson.connections || []);
          setEditName(cpJson.provider.name);
          setEditPrefix(cpJson.provider.prefix);
          setEditApiType(cpJson.provider.apiType);
          setEditBaseUrl(cpJson.provider.baseUrl);
          setLoading(false);
          return;
        }
      }

      setIsCustomProvider(false);
      const res = await fetch("/api/admin/providers");
      const json = await res.json();
      if (json.connections) {
        const matching = json.connections.filter(
          (c: ConnectionItem) =>
            c.provider.toLowerCase() === providerMeta.id.toLowerCase() ||
            c.provider.toLowerCase() === providerMeta.name.toLowerCase() ||
            (providerMeta.id === "OPENAI_CODEX" && c.provider.toLowerCase() === "openai")
        );
        setConnections(matching);
      }
    } catch {
      setError("Gagal memuat koneksi provider.");
    }
    setLoading(false);
  }

  // Fetch per-provider routing settings from database
  async function fetchProviderSettings() {
    try {
      const res = await fetch(
        `/api/admin/providers/settings?provider=${encodeURIComponent(providerMeta.id)}`
      );
      const json = await res.json();
      if (json.success) {
        setRoundRobinActive(Boolean(json.roundRobin));
      }
    } catch {}
  }

  // Toggle Round Robin and persist to database
  async function handleToggleRoundRobin(newVal: boolean) {
    setRoundRobinActive(newVal);
    try {
      const res = await fetch("/api/admin/providers/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerMeta.id,
          roundRobin: newVal,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(
          `Strategi routing ${providerMeta.name} disimpan: ${
            newVal ? "Round-Robin Berbobot (Weighted)" : "Smart Fallback (Priority Tertinggi)"
          }.`
        );
        setTimeout(() => setSuccess(""), 4000);
      } else {
        setError(json.error || "Gagal menyimpan preferensi routing.");
      }
    } catch {
      setError("Gagal menghubungi server untuk menyimpan preferensi routing.");
    }
  }

  // Pull / sync dynamic models for this provider
  async function fetchModels(pullLive = false) {
    if (pullLive) setIsPullingModels(true);
    try {
      const res = await fetch(
        `/api/admin/providers/models?provider=${encodeURIComponent(providerMeta.id)}${
          pullLive ? "&pull=true" : ""
        }`
      );
      const json = await res.json();
      if (json.success && Array.isArray(json.models)) {
        setModelsList(json.models);
        setModelsLoaded(true);
        setModelsSource(json.source || "CATALOG");
        if (pullLive) {
          setSuccess(
            `Berhasil memuat ${json.models.length} model terkini dari ${
              json.source === "LIVE_UPSTREAM" ? "upstream langsung" : "katalog terverifikasi"
            }.`
          );
          setTimeout(() => setSuccess(""), 4000);
        }
      }
    } catch {}
    if (pullLive) setIsPullingModels(false);
  }

  function handleOpenAddModal() {
    if (providerMeta.authType === "OAUTH") {
      setShowAddModal(true);
    } else {
      setShowAddKeyModal(true);
    }
  }

  // Custom & API Key Provider Handlers
  async function handleAddCustomApiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeySecret.trim()) return;
    setIsSavingKey(true);
    setError("");
    try {
      const providerKey = customProviderData
        ? `CUSTOM_${customProviderData.slug.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`
        : providerMeta.id;

      const res = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerKey,
          name: newKeyName.trim() || `API Key #${connections.length + 1}`,
          authType: "API_KEY",
          apiKey: newKeySecret.trim(),
          baseUrl: customProviderData?.baseUrl || providerMeta.baseUrl || "",
          compatibility: customProviderData?.compatibility || "OPENAI",
          priority: Number(newKeyPriority) || 1,
          weight: 1,
        }),
      });

      const json = await res.json();
      if (json.id || json.success) {
        setSuccess("API Key berhasil ditambahkan!");
        setTimeout(() => setSuccess(""), 3000);
        setShowAddKeyModal(false);
        setNewKeyName("");
        setNewKeySecret("");
        fetchConnections();
      } else {
        setError(json.error || "Gagal menambahkan API Key.");
      }
    } catch {
      setError("Kesalahan jaringan saat menyimpan API Key.");
    }
    setIsSavingKey(false);
  }

  async function handleSaveCustomProvider(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingCustom(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/providers/custom/${providerSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          prefix: editPrefix.trim(),
          apiType: editApiType,
          baseUrl: editBaseUrl.trim(),
        }),
      });
      const json = await res.json();
      if (json.success && json.provider) {
        setCustomProviderData(json.provider);
        setSuccess("Custom provider berhasil diperbarui!");
        setTimeout(() => setSuccess(""), 3000);
        setShowEditCustomModal(false);
        fetchConnections();
      } else {
        setError(json.error || "Gagal memperbarui custom provider.");
      }
    } catch {
      setError("Kesalahan jaringan saat memperbarui custom provider.");
    }
    setIsSavingCustom(false);
  }

  async function handleDeleteCustomProvider() {
    if (
      !confirm(
        `Yakin ingin menghapus custom provider "${customProviderData?.name || providerMeta.name}" beserta seluruh koneksi dan modelnya?`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/providers/custom/${providerSlug}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        router.push("/admin/providers");
      } else {
        setError(json.error || "Gagal menghapus custom provider.");
      }
    } catch {
      setError("Kesalahan jaringan saat menghapus custom provider.");
    }
  }

  async function handleImportFromModels() {
    setIsImportingModels(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(
        `/api/admin/providers/models?provider=${encodeURIComponent(providerSlug)}&pull=true&persist=true`
      );
      const json = await res.json();
      if (json.success && json.models) {
        setSuccess(`Berhasil mengimpor ${json.models.length} model dari endpoint /models!`);
        setTimeout(() => setSuccess(""), 4000);
        fetchModels(false);
      } else {
        setError(json.error || "Gagal mengimpor model dari endpoint /models.");
        setTimeout(() => setError(""), 4000);
      }
    } catch {
      setError("Terjadi kesalahan jaringan saat mengimpor model.");
      setTimeout(() => setError(""), 4000);
    }
    setIsImportingModels(false);
  }

  async function handleAddQuickModel(e: React.FormEvent) {
    e.preventDefault();
    if (!quickModelId.trim()) return;
    const modelToSave = quickModelId.trim();
    setIsAddingModel(true);
    setError("");
    try {
      const providerKey = customProviderData
        ? `CUSTOM_${customProviderData.slug.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`
        : providerMeta.id;

      const res = await fetch("/api/admin/providers/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerKey,
          modelId: modelToSave,
          name: modelToSave,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(`Model "${modelToSave}" berhasil ditambahkan.`);
        setTimeout(() => setSuccess(""), 3000);
        setQuickModelId("");
        fetchModels(false);
      } else {
        setError(json.error || "Gagal menambahkan model.");
      }
    } catch {
      setError("Kesalahan jaringan saat menambahkan model.");
    }
    setIsAddingModel(false);
  }

  // Handle adding model manually (modal)
  async function handleAddModel(e: React.FormEvent) {
    e.preventDefault();
    if (!newModelId.trim()) return;
    setIsAddingModel(true);
    setAddModelError("");
    try {
      const res = await fetch("/api/admin/providers/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerMeta.id,
          modelId: newModelId.trim(),
          name: newModelName.trim() || newModelId.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(`Model "${newModelId.trim()}" berhasil ditambahkan ke daftar.`);
        setTimeout(() => setSuccess(""), 4000);
        setShowAddModelModal(false);
        setNewModelId("");
        setNewModelName("");
        fetchModels(false);
      } else {
        setAddModelError(json.error || "Gagal menambahkan model.");
      }
    } catch {
      setAddModelError("Terjadi kesalahan jaringan saat menambahkan model.");
    }
    setIsAddingModel(false);
  }

  // Test single model upstream ping
  async function handleTestModel(modelId: string) {
    setTestingModelId(modelId);
    const start = performance.now();
    try {
      const res = await fetch("/api/admin/models/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, provider: providerMeta.id }),
      });
      const latency = Math.round(performance.now() - start);
      const json = await res.json();
      const ok = Boolean(json.success && json.status === "HEALTHY");
      setModelTestResults((prev) => ({
        ...prev,
        [modelId]: {
          latency: json.latencyMs || latency,
          ok,
          statusText: json.status || (ok ? "HEALTHY" : "ERROR"),
        },
      }));
      if (ok) {
        setSuccess(`Model "${modelId}" berhasil diuji (${json.latencyMs || latency}ms).`);
      } else {
        setError(json.error || `Model "${modelId}" gagal diuji: ${json.status || "Koneksi bermasalah"}.`);
      }
      setTimeout(() => {
        setSuccess("");
        setError("");
      }, 4000);
    } catch {
      const latency = Math.round(performance.now() - start);
      setModelTestResults((prev) => ({
        ...prev,
        [modelId]: { latency, ok: false, statusText: "ERROR" },
      }));
      setError(`Gagal menguji koneksi model "${modelId}".`);
      setTimeout(() => setError(""), 4000);
    }
    setTestingModelId(null);
  }

  // Delete a model from this provider
  async function handleDeleteModel(modelId: string) {
    if (!confirm(`Yakin ingin menghapus model "${modelId}" dari daftar provider ${providerMeta.name}?`)) {
      return;
    }
    setDeletingModelId(modelId);
    try {
      const res = await fetch(
        `/api/admin/providers/models?modelId=${encodeURIComponent(
          modelId
        )}&provider=${encodeURIComponent(providerMeta.id)}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (json.success) {
        setModelsList((prev) => prev.filter((m) => m.id.toLowerCase() !== modelId.toLowerCase()));
        setSuccess(`Model "${modelId}" berhasil dihapus.`);
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(json.error || "Gagal menghapus model.");
        setTimeout(() => setError(""), 4000);
      }
    } catch {
      setError("Terjadi kesalahan jaringan saat menghapus model.");
      setTimeout(() => setError(""), 4000);
    }
    setDeletingModelId(null);
  }

  // Capability detection for model badges (Vision & Thinking)
  function getModelCapabilities(id: string, name: string) {
    const combined = (id + " " + name).toLowerCase();
    const hasVision =
      combined.includes("vision") ||
      combined.includes("flash") ||
      combined.includes("4o") ||
      combined.includes("gemini") ||
      combined.includes("claude") ||
      combined.includes("sonnet") ||
      combined.includes("opus") ||
      combined.includes("gpt-4") ||
      combined.includes("astra");
    const hasThinking =
      combined.includes("thinking") ||
      combined.includes("high") ||
      combined.includes("medium") ||
      combined.includes("low") ||
      combined.includes("reasoning") ||
      combined.includes("r1") ||
      combined.includes("o1") ||
      combined.includes("o3");
    return { hasVision, hasThinking };
  }

  useEffect(() => {
    if (providerSlug) {
      fetchConnections();
      fetchProviderSettings();
      fetchModels(false);
    }
  }, [providerSlug, providerMeta]);

  // Priority reordering
  async function handlePriorityChange(conn: ConnectionItem, direction: "UP" | "DOWN") {
    const currentPriority = conn.priority || 1;
    const newPriority = direction === "UP" ? Math.max(1, currentPriority - 1) : currentPriority + 1;
    try {
      await fetch(`/api/admin/providers/${conn.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });
      fetchConnections();
    } catch {}
  }

  // Toggle active switch
  async function handleToggleActive(conn: ConnectionItem) {
    const nextActive = !conn.isActive;
    try {
      await fetch(`/api/admin/providers/${conn.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      setConnections((prev) =>
        prev.map((c) => (c.id === conn.id ? { ...c, isActive: nextActive } : c))
      );
    } catch {}
  }

  // Delete connection
  async function handleDelete(id: string) {
    if (!confirm("Hapus koneksi akun ini?")) return;
    try {
      const res = await fetch(`/api/admin/providers/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setSuccess("Koneksi berhasil dihapus.");
        setTimeout(() => setSuccess(""), 3000);
        fetchConnections();
      }
    } catch {
      setError("Gagal menghapus koneksi.");
    }
  }

  // Auto-ping connection
  async function handleAutoPing(conn: ConnectionItem) {
    setPingingId(conn.id);
    const start = performance.now();
    try {
      const res = await fetch(`/api/admin/providers/${conn.id}/sync`, { method: "POST" });
      const latency = Math.round(performance.now() - start);
      const json = await res.json();
      setPingResult((prev) => ({
        ...prev,
        [conn.id]: { latency, ok: json.success && json.connection?.syncStatus !== "ERROR" },
      }));
    } catch {
      const latency = Math.round(performance.now() - start);
      setPingResult((prev) => ({
        ...prev,
        [conn.id]: { latency, ok: false },
      }));
    }
    setPingingId(null);
  }

  // Sequential testing one-by-one across all connections
  async function handleTestOneByOne() {
    if (connections.length === 0 || isTestingOneByOne) return;
    setIsTestingOneByOne(true);
    setError("");
    setSuccess("");

    let healthyCount = 0;
    const currentResults: Record<string, { latency: number; ok: boolean }> = { ...pingResult };

    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      setTestingStep({ current: i + 1, total: connections.length });
      setPingingId(conn.id);

      const start = performance.now();
      try {
        const res = await fetch(`/api/admin/providers/${conn.id}/sync`, { method: "POST" });
        const latency = Math.round(performance.now() - start);
        const json = await res.json();
        const isHealthy = json.success && json.syncResult?.status !== "ERROR";
        if (isHealthy) healthyCount++;

        currentResults[conn.id] = {
          latency: json.syncResult?.latencyMs || latency,
          ok: isHealthy,
        };
        setPingResult({ ...currentResults });
      } catch {
        const latency = Math.round(performance.now() - start);
        currentResults[conn.id] = { latency, ok: false };
        setPingResult({ ...currentResults });
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    setPingingId(null);
    setIsTestingOneByOne(false);
    setTestingStep(null);
    setSuccess(
      `Pengujian bertahap selesai: ${healthyCount}/${connections.length} akun teruji sehat & normal.`
    );
    setTimeout(() => setSuccess(""), 5000);
    fetchConnections();
  }

  // Models for this provider (prioritize live models pulled from upstream)
  const availableModels = useMemo(() => {
    if (modelsLoaded) return modelsList;
    if (modelsList.length > 0) return modelsList;
    const key = providerMeta.id.toUpperCase();
    return (
      SHARED_PROVIDER_MODELS[key] ||
      SHARED_PROVIDER_MODELS[providerMeta.name.toUpperCase()] || [
        { id: `${providerSlug}-chat`, name: `${providerMeta.name} Standard` },
        { id: `${providerSlug}-fast`, name: `${providerMeta.name} Fast` },
      ]
    );
  }, [modelsLoaded, modelsList, providerMeta, providerSlug]);

  async function copyModelId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedModel(id);
      setTimeout(() => setCopiedModel(null), 1500);
    } catch {}
  }

  return (
    <DashboardShell>
      <div className="content">
        {/* Top Header / Breadcrumb Navigation */}
        {isCustomProvider ? (
          <div className="custom-provider-header">
            <div className="custom-provider-info">
              <div className="custom-provider-nav">
                <Link
                  href="/admin/providers"
                  className="breadcrumb-link flex items-center gap-1"
                >
                  <ChevronRight size={13} className="rotate-180" />
                  <span>Providers</span>
                </Link>
                <span className="breadcrumb-sep">&gt;</span>
                <span className="custom-provider-tag">
                  Custom Provider
                </span>
              </div>
              <div className="custom-provider-title-row">
                <h1 className="custom-provider-title">
                  {customProviderData?.name || providerMeta.name}
                </h1>
              </div>
              <p className="custom-provider-subtext">
                {customProviderData?.apiType || "Chat Completions"} · {customProviderData?.baseUrl}
              </p>
            </div>

            <div className="custom-provider-actions">
              <button
                type="button"
                onClick={() => setShowAddKeyModal(true)}
                className="btn-custom-add-key"
              >
                <Plus size={14} />
                <span>Add API Key</span>
              </button>

              <button
                type="button"
                onClick={() => setShowEditCustomModal(true)}
                className="btn-custom-edit"
              >
                <Edit size={13} />
                <span>Edit</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteCustomProvider}
                className="btn-custom-delete"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="provider-breadcrumb-bar">
            <Link href="/admin/providers" className="breadcrumb-link flex items-center gap-1">
              <ChevronRight size={13} className="rotate-180" />
              <span>Providers</span>
            </Link>
            <span className="breadcrumb-sep">&gt;</span>
            <div className="breadcrumb-current flex items-center gap-2">
              <ProviderAvatar
                slugOrId={providerMeta.slug || providerMeta.id}
                name={providerMeta.name}
                iconName={providerMeta.iconName}
                brandColor={providerMeta.color}
                size={22}
                imgSize={16}
                className="provider-logo-badge"
              />
              <span className="provider-current-name">{providerMeta.name}</span>
            </div>

            <button
              className="control btn-icon-only ml-auto"
              onClick={fetchConnections}
              title="Refresh"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        )}

        {/* Notifications */}
        {success && (
          <div className="banner-alert mb-4">
            <CheckCircle2 size={16} className="text-green" />
            <div className="banner-text">
              <strong>Berhasil</strong>
              <p>{success}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="login-error mb-4 flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* ===================================================================
            CARD 1: CONNECTIONS LIST
            =================================================================== */}
        <div className="provider-detail-view">
          <div className="detail-card-panel">
            <div className="detail-card-header">
              <h2 className="detail-card-title">Connections</h2>
              <div className="detail-header-actions">
                <button
                  type="button"
                  className="btn-test-one-by-one"
                  disabled={isTestingOneByOne || connections.length === 0}
                  onClick={handleTestOneByOne}
                  title="Uji koneksi setiap akun satu per satu secara berurutan"
                >
                  <Play size={11} className={isTestingOneByOne ? "animate-spin" : ""} />
                  <span>
                    {isTestingOneByOne && testingStep
                      ? `Testing ${testingStep.current}/${testingStep.total}...`
                      : "Test Connection One-by-One"}
                  </span>
                </button>

                <label
                  className="switch-control-label"
                  title="Aktifkan distribusi Round-Robin berbobot khusus untuk provider ini"
                >
                  <span>Round Robin</span>
                  <input
                    type="checkbox"
                    checked={roundRobinActive}
                    onChange={(e) => handleToggleRoundRobin(e.target.checked)}
                  />
                  <span className="switch-slider" />
                </label>
              </div>
            </div>

            <div className="connections-card-body">
              <div className="select-all-row">
                <input type="checkbox" id="selectAllConns" />
                <label htmlFor="selectAllConns">Select All</label>
              </div>

              {loading ? (
                <div className="p-8 text-center text-muted text-xs">
                  Memuat akun koneksi {providerMeta.name}...
                </div>
              ) : connections.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs text-muted mb-3">
                    Belum ada akun terhubung untuk {providerMeta.name}.
                  </p>
                  <button
                    type="button"
                    className="btn-add-conn-primary inline-flex items-center gap-1.5"
                    onClick={handleOpenAddModal}
                  >
                    <Plus size={13} />
                    <span>{providerMeta.authType === "OAUTH" ? "Connect Account" : "Add API Key"}</span>
                  </button>
                </div>
              ) : (
                <div className="connections-list-group">
                  {connections.map((conn, idx) => (
                    <div key={conn.id} className="conn-item-row">
                      <div className="conn-left-col">
                        <input type="checkbox" />
                        <div className="priority-arrows-col">
                          <button
                            type="button"
                            className="arrow-btn"
                            disabled={idx === 0}
                            onClick={() => handlePriorityChange(conn, "UP")}
                            title="Tingkatkan Prioritas"
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            type="button"
                            className="arrow-btn"
                            disabled={idx === connections.length - 1}
                            onClick={() => handlePriorityChange(conn, "DOWN")}
                            title="Turunkan Prioritas"
                          >
                            <ChevronDown size={12} />
                          </button>
                        </div>

                        {conn.authType === "API_KEY" || isCustomProvider ? (
                          <KeyRound size={13} className="text-[#a1a1aa] shrink-0 ml-1" />
                        ) : (
                          <Lock size={13} className="text-[#a1a1aa] shrink-0 ml-1" />
                        )}

                        <div className="conn-identity-wrap">
                          <div className="flex items-center gap-2">
                            <span className="conn-email-text font-semibold">
                              {conn.accountEmail || conn.name}
                            </span>
                            {pingResult[conn.id] && !pingResult[conn.id].ok && (
                              <span className="text-[10.5px] font-mono text-red-400 bg-red-950/70 px-1.5 py-0.5 rounded border border-red-900/60 max-w-[280px] truncate">
                                [Error]: Ping Failed
                              </span>
                            )}
                          </div>
                          <div className="conn-status-chips">
                            <span
                              className={`status-chip ${
                                conn.isActive ? "active" : "disabled"
                              }`}
                            >
                              ● {conn.isActive ? "active" : "disabled"}
                            </span>
                            <span className="type-chip">
                              {conn.authType === "OAUTH" ? "OAuth" : "API Key"}
                            </span>
                            <span className="priority-chip">
                              #{conn.priority || idx + 1}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="conn-right-actions">
                        <button
                          type="button"
                          className="btn-auto-ping"
                          onClick={() => handleAutoPing(conn)}
                          disabled={pingingId === conn.id}
                        >
                          <Zap size={11} />
                          <span>
                            {pingingId === conn.id
                              ? "Pinging..."
                              : pingResult[conn.id]
                              ? `${pingResult[conn.id].latency}ms`
                              : "Auto-ping"}
                          </span>
                        </button>

                        <button
                          type="button"
                          className="icon-action-btn"
                          onClick={() => {
                            setEditingConn(conn);
                            setShowEditModal(true);
                          }}
                          title="Edit"
                        >
                          <Edit size={13} />
                        </button>

                        <button
                          type="button"
                          className="icon-action-btn delete"
                          onClick={() => handleDelete(conn.id)}
                          title="Hapus"
                        >
                          <Trash2 size={13} />
                        </button>

                        <label className="switch-control-label mini ml-2">
                          <input
                            type="checkbox"
                            checked={conn.isActive}
                            onChange={() => handleToggleActive(conn)}
                          />
                          <span className="switch-slider mini" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="connections-card-footer">
                <button
                  type="button"
                  className="btn-add-conn-primary"
                  onClick={handleOpenAddModal}
                >
                  <Plus size={13} />
                  <span>{providerMeta.authType === "OAUTH" ? "Add Account" : "Add API Key"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* ===================================================================
              CARD 2: AVAILABLE MODELS
              =================================================================== */}
          <div className="detail-card-panel mt-6">
            <div className="detail-card-header">
              <div className="flex items-center gap-2.5">
                <h2 className="detail-card-title">Available Models</h2>
                <span className="models-source-badge">
                  {modelsSource === "LIVE_UPSTREAM" || modelsSource === "DATABASE_MERGED" ? "● Live Upstream" : "● Terverifikasi"} ({availableModels.length})
                </span>
                {providerPrefix && (
                  <span className="model-prefix-badge" title={`Routing prefix untuk provider ${providerMeta.name}`}>
                    Prefix: <code>{providerPrefix}</code>
                  </span>
                )}
              </div>
              <div className="detail-header-actions">
                <button
                  type="button"
                  className="btn-pull-models"
                  onClick={() => fetchModels(true)}
                  disabled={isPullingModels}
                  title="Tarik daftar model terkini langsung dari provider upstream"
                >
                  <RefreshCw size={11} className={isPullingModels ? "animate-spin" : ""} />
                  <span>{isPullingModels ? "Pulling Models..." : "Pull Latest Models"}</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted">Thinking:</span>
                  <CustomDropdown
                    size="sm"
                    value={thinkingLevel}
                    onChange={(val) => setThinkingLevel(val)}
                    options={[
                      { value: "AUTO", label: "Auto" },
                      { value: "HIGH", label: "High" },
                      { value: "OFF", label: "Off" },
                    ]}
                    minWidth={85}
                    width={85}
                  />
                </div>

                <label className="switch-control-label">
                  <span className="flex items-center gap-1">
                    <Ban size={12} className="text-red-500" />
                    <span>Disable All</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={allDisabled}
                    onChange={(e) => setAllDisabled(e.target.checked)}
                  />
                  <span className="switch-slider" />
                </label>
              </div>
            </div>

            {/* Subtitle & Model ID Input Row (Only for Custom Providers) */}
            {isCustomProvider && (
              <div className="px-5 pt-4 pb-3 border-b border-[var(--border)]">
                <p className="text-xs text-muted mb-3">
                  Add {customProviderData?.compatibility === "ANTHROPIC" ? "Anthropic" : "OpenAI"}-compatible models manually
                  {(!customProviderData?.compatibility || customProviderData?.compatibility === "OPENAI") &&
                    " or import them from the /models endpoint."}
                </p>

                <form onSubmit={handleAddQuickModel} className="flex flex-col gap-1.5 mb-1">
                  <label className="text-[11px] font-semibold text-muted">
                    Model ID
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={quickModelId}
                      onChange={(e) => setQuickModelId(e.target.value)}
                      placeholder={providerPrefix ? `${providerPrefix}model-name` : "model-name"}
                      className="control flex-1 text-xs font-mono"
                    />
                    <button
                      type="submit"
                      disabled={!quickModelId.trim() || isAddingModel}
                      className="control btn-inline text-xs font-semibold px-3.5 py-1.5"
                    >
                      <Plus size={12} />
                      <span>Add</span>
                    </button>
                    {(!customProviderData?.compatibility || customProviderData?.compatibility === "OPENAI") && (
                      <button
                        type="button"
                        onClick={handleImportFromModels}
                        disabled={isImportingModels}
                        className="control btn-inline text-xs font-semibold px-3.5 py-1.5 flex items-center gap-1.5 bg-[#f8fafc] hover:bg-[#f1f5f9]"
                        title="Import list of models directly from upstream GET /v1/models"
                      >
                        <Download size={12} className={isImportingModels ? "animate-bounce" : ""} />
                        <span>{isImportingModels ? "Importing..." : "Import from /models"}</span>
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}

            <div className="models-grid-row">
              {availableModels.map((m) => {
                const caps = getModelCapabilities(m.id, m.name);
                const testRes = modelTestResults[m.id];
                const isTesting = testingModelId === m.id;
                const isDeleting = deletingModelId === m.id;

                return (
                  <div key={m.id} className="model-card-item">
                    <div className="model-avatar-col">
                      <Bot size={18} className="text-muted" />
                    </div>
                    <div className="model-info-col">
                      <strong className="model-id-title">{m.id}</strong>
                      <div className="model-subtitle-row">
                        <span className="model-subtitle">{m.name}</span>
                        <span className="model-caps-wrap">
                          {caps.hasVision && (
                            <span className="model-cap-tag" title="Mendukung Vision (Multimodal)">
                              <Eye size={11} />
                            </span>
                          )}
                          {caps.hasThinking && (
                            <span className="model-cap-tag" title="Mendukung Reasoning / Thinking">
                              <Brain size={11} />
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="model-actions-row">
                      {/* 1. Test Button */}
                      <button
                        type="button"
                        className={`model-action-btn test ${
                          testRes ? (testRes.ok ? "healthy" : "error") : ""
                        }`}
                        onClick={() => handleTestModel(m.id)}
                        disabled={isTesting}
                        title={
                          testRes
                            ? `Status: ${testRes.statusText} (${testRes.latency}ms) - Klik untuk tes ulang`
                            : "Test koneksi model ini"
                        }
                      >
                        {isTesting ? (
                          <RefreshCw size={12} className="animate-spin text-blue" />
                        ) : (
                          <FlaskConical size={13} />
                        )}
                      </button>

                      {/* 2. Copy Button */}
                      <button
                        type="button"
                        className="model-action-btn copy"
                        onClick={() => copyModelId(m.id)}
                        title="Salin Model ID"
                      >
                        {copiedModel === m.id ? (
                          <Check size={12} className="text-green" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>

                      {/* 3. Delete Button */}
                      <button
                        type="button"
                        className="model-action-btn delete"
                        onClick={() => handleDeleteModel(m.id)}
                        disabled={isDeleting}
                        title="Hapus model ini"
                      >
                        {isDeleting ? (
                          <RefreshCw size={12} className="animate-spin text-red" />
                        ) : (
                          <X size={13} />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Add Model Manual Button Card */}
              <button
                type="button"
                className="model-card-add-btn"
                onClick={() => {
                  setNewModelId(providerPrefix);
                  setNewModelName("");
                  setAddModelError("");
                  setShowAddModelModal(true);
                }}
                title="Tambahkan model kustom secara manual"
              >
                <Plus size={15} />
                <span>Add Model</span>
              </button>
            </div>
          </div>
        </div>

        {/* ===================================================================
            MODALS: OAUTH DARK MODAL OR CUSTOM MODAL
            =================================================================== */}
        {showAddModal && (
          <OAuthDarkModal
            provider={providerMeta}
            onClose={() => setShowAddModal(false)}
            onSuccess={(msg) => {
              setSuccess(msg);
              setTimeout(() => setSuccess(""), 4000);
              fetchConnections();
            }}
            onError={(msg) => {
              setError(msg);
              setTimeout(() => setError(""), 4000);
            }}
          />
        )}

        {showEditModal && editingConn && (
          <EditConnectionModal
            connection={editingConn}
            onClose={() => {
              setShowEditModal(false);
              setEditingConn(null);
            }}
            onSuccess={(msg) => {
              setSuccess(msg);
              setTimeout(() => setSuccess(""), 4000);
              fetchConnections();
            }}
            onError={(msg) => {
              setError(msg);
              setTimeout(() => setError(""), 4000);
            }}
          />
        )}

        {/* ===================================================================
            MODAL: ADD MODEL MANUALLY
            =================================================================== */}
        {showAddModelModal && (
          <div className="oauth-modal-overlay">
            <div className="oauth-modal-card" style={{ width: "460px" }}>
              <div className="oauth-modal-header">
                <div className="oauth-modal-title-wrap">
                  <ProviderAvatar
                    slugOrId={providerMeta.slug || providerMeta.id}
                    name={providerMeta.name}
                    iconName={providerMeta.iconName}
                    brandColor={providerMeta.color}
                    size={28}
                    imgSize={18}
                    className="oauth-provider-badge"
                  />
                  <h3 className="oauth-modal-title-text">
                    Add Model ({providerMeta.name})
                  </h3>
                </div>
                <button
                  type="button"
                  className="oauth-btn-close"
                  onClick={() => setShowAddModelModal(false)}
                  title="Tutup"
                >
                  <X size={15} />
                </button>
              </div>

              {addModelError && (
                <div className="oauth-alert-error m-4">
                  <AlertCircle size={14} />
                  <span>{addModelError}</span>
                </div>
              )}

              <form onSubmit={handleAddModel}>
                <div className="oauth-modal-body">
                  <div className="oauth-step-block">
                    <label className="oauth-step-label">Model ID / Identifier *</label>
                    <input
                      type="text"
                      required
                      className="oauth-input-control font-mono"
                      placeholder={
                        providerPrefix
                          ? `${providerPrefix}custom-model`
                          : "custom-model-id"
                      }
                      value={newModelId}
                      onChange={(e) => setNewModelId(e.target.value)}
                    />
                    <p className="oauth-step-subtext">
                      ID model yang dipanggil klien AI (contoh: <code>{providerPrefix ? `${providerPrefix}gemini-pro` : "model-id"}</code>).
                    </p>
                  </div>

                  <div className="oauth-step-block">
                    <label className="oauth-step-label">Display Name (Opsional)</label>
                    <input
                      type="text"
                      className="oauth-input-control"
                      placeholder="Contoh: Gemini 3.8 Flash (Custom)"
                      value={newModelName}
                      onChange={(e) => setNewModelName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="oauth-modal-footer-clean">
                  <button
                    type="button"
                    className="oauth-footer-cancel-btn"
                    onClick={() => setShowAddModelModal(false)}
                    disabled={isAddingModel}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="oauth-footer-submit-btn"
                    disabled={!newModelId.trim() || isAddingModel}
                  >
                    <Plus size={13} />
                    <span>{isAddingModel ? "Menyimpan..." : "Simpan Model"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===================================================================
            MODAL: ADD API KEY PROVIDER
            =================================================================== */}
        {showAddKeyModal && (
          <div className="oauth-modal-overlay">
            <div className="oauth-modal-card" style={{ width: "480px" }}>
              <div className="oauth-modal-header">
                <div className="oauth-modal-title-wrap">
                  <ProviderAvatar
                    slugOrId={providerMeta.slug || providerMeta.id}
                    name={providerMeta.name}
                    iconName={providerMeta.iconName}
                    brandColor={providerMeta.color}
                    size={28}
                    imgSize={18}
                    className="oauth-provider-badge"
                  />
                  <h3 className="oauth-modal-title-text">
                    Add API Key ({customProviderData?.name || providerMeta.name})
                  </h3>
                  <span className="oauth-tag-badge">API Key</span>
                </div>
                <button
                  type="button"
                  className="oauth-btn-close"
                  onClick={() => setShowAddKeyModal(false)}
                  title="Tutup"
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleAddCustomApiKey}>
                <div className="oauth-modal-body">
                  {(customProviderData?.baseUrl || providerMeta.baseUrl) && (
                    <div className="mb-4 p-3 rounded-lg bg-blue-50/80 border border-blue-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-slate-600 font-medium">Upstream Endpoint:</span>
                      </div>
                      <code className="font-mono font-semibold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                        {customProviderData?.baseUrl || providerMeta.baseUrl}
                      </code>
                    </div>
                  )}

                  <div className="oauth-step-block">
                    <label className="oauth-step-label">Label / Key Name (Opsional)</label>
                    <input
                      type="text"
                      className="oauth-input-control"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder={`Contoh: ${customProviderData?.name || providerMeta.name} Primary`}
                    />
                    <p className="oauth-step-subtext">Nama pengenal akun untuk routing dan failover.</p>
                  </div>

                  <div className="oauth-step-block">
                    <label className="oauth-step-label">API Key *</label>
                    <input
                      type="password"
                      required
                      className="oauth-input-control font-mono"
                      value={newKeySecret}
                      onChange={(e) => setNewKeySecret(e.target.value)}
                      placeholder="sk-..."
                    />
                    <p className="oauth-step-subtext">Kunci API dienkripsi aman dengan standar AES-256-GCM.</p>
                  </div>

                  <div className="oauth-step-block">
                    <label className="oauth-step-label">Prioritas Routing</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      className="oauth-input-control"
                      value={newKeyPriority}
                      onChange={(e) => setNewKeyPriority(Number(e.target.value))}
                    />
                    <p className="oauth-step-subtext">Nilai 1 = Prioritas utama (dipanggil pertama).</p>
                  </div>
                </div>

                <div className="oauth-modal-footer-clean">
                  <button
                    type="button"
                    className="oauth-footer-cancel-btn"
                    onClick={() => setShowAddKeyModal(false)}
                    disabled={isSavingKey}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="oauth-footer-submit-btn"
                    disabled={isSavingKey || !newKeySecret.trim()}
                  >
                    <Plus size={13} />
                    <span>{isSavingKey ? "Menyimpan..." : "Simpan API Key"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===================================================================
            MODAL: EDIT CUSTOM PROVIDER METADATA
            =================================================================== */}
        {showEditCustomModal && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ width: "480px" }}>
              <div className="modal-header">
                <div className="modal-title-wrap">
                  <Bot size={15} className="text-blue shrink-0" />
                  <h3 className="modal-title-text">
                    Edit Custom Provider ({customProviderData?.name || providerMeta.name})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditCustomModal(false)}
                  className="btn-close"
                  title="Tutup"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveCustomProvider} className="p-1">
                <div className="form-group mb-3">
                  <label className="text-xs font-semibold mb-1 block">Provider Name *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="control w-full text-xs"
                  />
                </div>

                <div className="form-group mb-3">
                  <label className="text-xs font-semibold mb-1 block">Prefix</label>
                  <input
                    type="text"
                    value={editPrefix}
                    onChange={(e) => setEditPrefix(e.target.value)}
                    className="control w-full text-xs mono"
                  />
                </div>

                <div className="form-group mb-3">
                  <label className="text-xs font-semibold mb-1 block">API Type</label>
                  <CustomDropdown
                    size="md"
                    width="100%"
                    value={editApiType}
                    onChange={(val) => setEditApiType(val as any)}
                    options={[
                      { value: "Chat Completions", label: "Chat Completions" },
                      { value: "Anthropic Messages", label: "Anthropic Messages" },
                    ]}
                  />
                </div>

                <div className="form-group mb-3">
                  <label className="text-xs font-semibold mb-1 block">Base URL *</label>
                  <input
                    type="url"
                    required
                    value={editBaseUrl}
                    onChange={(e) => setEditBaseUrl(e.target.value)}
                    className="control w-full text-xs mono"
                  />
                </div>

                <div className="modal-actions flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setShowEditCustomModal(false)}
                    disabled={isSavingCustom}
                    className="control text-xs"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCustom || !editName.trim() || !editBaseUrl.trim()}
                    className="primary btn-inline text-xs"
                  >
                    {isSavingCustom ? "Menyimpan..." : "Simpan Perubahan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
