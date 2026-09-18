"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type StoreRow = { id: string; name: string; timezone?: string };
type MatrixRow = {
  action: string;
  brand_admin: boolean;
  owner: boolean;
  manager: boolean;
  floor: boolean;
  kitchen: boolean;
};

export function MultiStoreClient({
  role,
  brand,
  stores,
  activeStoreId,
  canManage,
  permissionMatrix,
}: {
  role: string;
  brand: { id: string; name: string } | null;
  stores: StoreRow[];
  activeStoreId: string;
  canManage: boolean;
  permissionMatrix: MatrixRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createStore() {
    if (!brand || !name.trim()) return;
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id, name: name.trim(), timezone: "Asia/Tokyo" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "作成に失敗しました");
        return;
      }
      setName("");
      setMsg(`店舗を作成しました: ${data.store.name}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function switchTo(storeId: string) {
    if (storeId === activeStoreId) return;
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/session/switch-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "切替に失敗しました");
        return;
      }
      setMsg(`切替完了: ${data.store?.name ?? storeId}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h3 style={{ margin: 0 }}>ブランドツリー</h3>
        <div>
          <strong>{brand?.name ?? "（ブランドなし）"}</strong>
          <span className="muted"> · ログイン役割: {role}</span>
        </div>
        <ul>
          {stores.map((s) => (
            <li key={s.id}>
              {s.name}
              {s.id === activeStoreId ? " ← 現在" : ""}
              <span className="muted"> ({s.timezone ?? "Asia/Tokyo"})</span>
              {canManage && s.id !== activeStoreId ? (
                <>
                  {" "}
                  <button className="btn secondary" type="button" disabled={pending} onClick={() => switchTo(s.id)}>
                    切替
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        {canManage ? (
          <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="新店舗名"
              style={{ flex: 1, padding: "0.4rem 0.6rem" }}
            />
            <button className="btn" type="button" disabled={pending || !name.trim()} onClick={createStore}>
              店舗を追加
            </button>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            店長 / オーナーは自店のみ表示。店舗横断切替は brand_admin のみ。
          </p>
        )}
        {msg ? <div className="muted">{msg}</div> : null}
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>権限マトリクス（MVP）</h3>
        <table className="table">
          <thead>
            <tr>
              <th>操作</th>
              <th>brand_admin</th>
              <th>owner</th>
              <th>manager</th>
              <th>floor</th>
              <th>kitchen</th>
            </tr>
          </thead>
          <tbody>
            {permissionMatrix.map((row) => (
              <tr key={row.action}>
                <td>{row.action}</td>
                <td>{row.brand_admin ? "✓" : "—"}</td>
                <td>{row.owner ? "✓" : "—"}</td>
                <td>{row.manager ? "✓" : "—"}</td>
                <td>{row.floor ? "✓" : "—"}</td>
                <td>{row.kitchen ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
