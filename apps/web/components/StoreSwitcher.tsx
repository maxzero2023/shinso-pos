"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type StoreOpt = { id: string; name: string };

export function StoreSwitcher({
  stores,
  activeStoreId,
  canSwitch,
}: {
  stores: StoreOpt[];
  activeStoreId: string;
  canSwitch: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (stores.length === 0) return null;

  async function onChange(storeId: string) {
    if (!canSwitch || storeId === activeStoreId) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/session/switch-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "切替に失敗しました");
        return;
      }
      router.refresh();
    } catch {
      setError("切替に失敗しました");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div className="muted" style={{ color: "#9fd9b8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
        店舗
      </div>
      {canSwitch && stores.length > 1 ? (
        <select
          value={activeStoreId}
          disabled={pending}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            padding: "0.35rem 0.5rem",
            borderRadius: 6,
            border: "1px solid #3a6a52",
            background: "#0a3d28",
            color: "white",
            fontSize: "0.85rem",
          }}
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : (
        <div style={{ fontSize: "0.85rem" }}>
          {stores.find((s) => s.id === activeStoreId)?.name ?? activeStoreId}
        </div>
      )}
      {error ? (
        <div style={{ color: "#ffb4b4", fontSize: "0.75rem", marginTop: "0.25rem" }}>{error}</div>
      ) : null}
    </div>
  );
}
