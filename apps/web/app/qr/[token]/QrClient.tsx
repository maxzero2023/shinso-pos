"use client";

import { useEffect, useState } from "react";

type MenuCategory = {
  id: string;
  name: string;
  items: Array<{
    id: string;
    name: string;
    priceYen: number;
    description?: string | null;
  }>;
};

export function QrClient({ token }: { token: string }) {
  const [tableCode, setTableCode] = useState("");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [checkTotal, setCheckTotal] = useState<number | null>(null);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const menuRes = await fetch(`/api/qr/${token}/menu`);
      const menuData = await menuRes.json();
      if (!menuRes.ok) {
        setError(menuData.error ?? "メニュー取得失敗");
        return;
      }
      setTableCode(menuData.table.code);
      setCategories(menuData.categories);

      const checkRes = await fetch(`/api/qr/${token}/check`);
      const checkData = await checkRes.json();
      if (checkRes.ok) {
        setCheckTotal(checkData.check.totalYen);
        setCheckId(checkData.check.id);
      } else if (checkRes.status === 409) {
        setError(checkData.error);
      }
    })();
  }, [token]);

  function bump(id: string, delta: number) {
    setCart((c) => {
      const next = { ...c, [id]: Math.max(0, (c[id] ?? 0) + delta) };
      if (next[id] === 0) delete next[id];
      return next;
    });
  }

  async function submit() {
    setMsg("");
    const entries = Object.entries(cart);
    if (!entries.length) return;
    for (const [menuItemId, qty] of entries) {
      const res = await fetch(`/api/qr/${token}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuItemId, qty, modifierIds: [] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "注文失敗");
        return;
      }
      setCheckId(data.checkId);
    }
    setCart({});
    setMsg("ご注文を受け付けました（同一伝票に追加）");
    const checkRes = await fetch(`/api/qr/${token}/check`);
    const checkData = await checkRes.json();
    if (checkRes.ok) setCheckTotal(checkData.check.totalYen);
  }

  if (error && !categories.length) {
    return (
      <div className="mobile-shell">
        <div className="card" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-shell stack">
      <div>
        <div style={{ color: "var(--brand)", fontWeight: 800 }}>ゲスト注文</div>
        <h1 style={{ margin: "0.2rem 0" }}>テーブル {tableCode}</h1>
        {checkId ? (
          <div className="muted">
            伝票 {checkId.slice(-6)} / 現在 ¥{(checkTotal ?? 0).toLocaleString()}
          </div>
        ) : null}
      </div>
      {error ? <div className="card" style={{ color: "var(--danger)" }}>{error}</div> : null}
      {msg ? <div className="card">{msg}</div> : null}
      {categories.map((c) => (
        <div key={c.id} className="card stack">
          <strong>{c.name}</strong>
          {c.items.map((item) => (
            <div key={item.id} className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div>{item.name}</div>
                <div className="muted">¥{item.priceYen.toLocaleString()}</div>
              </div>
              <div className="row">
                <button className="btn ghost" type="button" onClick={() => bump(item.id, -1)}>
                  −
                </button>
                <span>{cart[item.id] ?? 0}</span>
                <button className="btn ghost" type="button" onClick={() => bump(item.id, 1)}>
                  ＋
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
      <button
        className="btn"
        type="button"
        disabled={!Object.keys(cart).length}
        onClick={submit}
        style={{ position: "sticky", bottom: 12 }}
      >
        カートを注文する
      </button>
    </div>
  );
}
