"use client";

import { useCallback, useEffect, useState } from "react";

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  lowStockThreshold: number;
  costYenPerUnit: number;
  active: boolean;
  onHand: number;
  isLowStock: boolean;
};

type LedgerEntry = {
  id: string;
  ingredientId: string;
  qtyDelta: number;
  reason: string;
  createdAt: string;
  ingredient?: { id: string; name: string; unit: string };
  createdBy?: { id: string; name: string } | null;
};

type BomLine = {
  id: string;
  menuItemId: string;
  ingredientId: string;
  qtyPerItem: number;
  ingredient?: { id: string; name: string; unit: string };
  menuItem?: { id: string; name: string };
};

type MenuItemOpt = { id: string; name: string; categoryName: string };

type Tab = "ingredients" | "ledger" | "bom" | "alerts" | "usage";

export function InventoryClient({ canEdit }: { canEdit: boolean }) {
  const [tab, setTab] = useState<Tab>("ingredients");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [bom, setBom] = useState<BomLine[]>([]);
  const [alerts, setAlerts] = useState<Ingredient[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemOpt[]>([]);
  const [usage, setUsage] = useState<{
    from: string;
    to: string;
    ingredients: Array<{
      ingredientName: string;
      unit: string;
      estimatedQty: number;
      byMenuItem: Array<{ menuItemName: string; soldQty: number; usage: number }>;
    }>;
  } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // create ingredient form
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"g" | "ml" | "pc">("g");
  const [threshold, setThreshold] = useState(1000);
  const [cost, setCost] = useState(0);

  // ledger form
  const [ledgerIngId, setLedgerIngId] = useState("");
  const [ledgerQty, setLedgerQty] = useState(100);
  const [ledgerReason, setLedgerReason] = useState("inbound");
  const [ledgerDir, setLedgerDir] = useState<"in" | "out">("in");

  // bom form
  const [bomMenuId, setBomMenuId] = useState("");
  const [bomIngId, setBomIngId] = useState("");
  const [bomQty, setBomQty] = useState(50);

  const refresh = useCallback(async () => {
    const [ing, led, bomRes, low, menu] = await Promise.all([
      fetch("/api/inventory/ingredients").then((r) => r.json()),
      fetch("/api/inventory/ledger?limit=50").then((r) => r.json()),
      fetch("/api/inventory/bom").then((r) => r.json()),
      fetch("/api/inventory/low-stock").then((r) => r.json()),
      fetch("/api/menu/categories").then((r) => r.json()),
    ]);
    if (ing.ingredients) {
      setIngredients(ing.ingredients);
      if (!ledgerIngId && ing.ingredients[0]) setLedgerIngId(ing.ingredients[0].id);
      if (!bomIngId && ing.ingredients[0]) setBomIngId(ing.ingredients[0].id);
    }
    if (led.entries) setLedger(led.entries);
    if (bomRes.lines) setBom(bomRes.lines);
    if (low.alerts) setAlerts(low.alerts);
    if (menu.categories) {
      const opts: MenuItemOpt[] = [];
      for (const c of menu.categories as Array<{
        name: string;
        items: Array<{ id: string; name: string }>;
      }>) {
        for (const it of c.items ?? []) {
          opts.push({ id: it.id, name: it.name, categoryName: c.name });
        }
      }
      setMenuItems(opts);
      if (!bomMenuId && opts[0]) setBomMenuId(opts[0].id);
    }
  }, [ledgerIngId, bomIngId, bomMenuId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createIngredient() {
    if (!canEdit) return;
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/inventory/ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        unit,
        lowStockThreshold: threshold,
        costYenPerUnit: cost,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "作成失敗");
      return;
    }
    setName("");
    setMsg(`原料「${data.ingredient.name}」を登録しました`);
    await refresh();
  }

  async function postMovement() {
    setBusy(true);
    setMsg("");
    const qtyDelta = ledgerDir === "in" ? Math.abs(ledgerQty) : -Math.abs(ledgerQty);
    const res = await fetch("/api/inventory/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredientId: ledgerIngId,
        qtyDelta,
        reason: ledgerReason || (ledgerDir === "in" ? "inbound" : "outbound"),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "出入庫失敗");
      return;
    }
    setMsg(
      `${ledgerDir === "in" ? "入庫" : "出庫"}完了（現在庫 ${data.onHand}）`
    );
    await refresh();
  }

  async function createBom() {
    if (!canEdit) return;
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/inventory/bom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menuItemId: bomMenuId,
        ingredientId: bomIngId,
        qtyPerItem: bomQty,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "BOM 作成失敗");
      return;
    }
    setMsg("BOM 行を追加しました");
    await refresh();
  }

  async function deleteBom(id: string) {
    if (!canEdit) return;
    setBusy(true);
    const res = await fetch(`/api/inventory/bom/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      setMsg(data.error ?? "削除失敗");
      return;
    }
    setMsg("BOM 行を削除しました");
    await refresh();
  }

  async function loadUsage() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/inventory/usage-estimate");
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "粗算失敗");
      return;
    }
    setUsage(data.estimate);
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "ingredients", label: "原料" },
    { id: "ledger", label: "出入庫" },
    { id: "bom", label: "BOM" },
    { id: "alerts", label: `低在庫 (${alerts.length})` },
    { id: "usage", label: "粗算耗用" },
  ];

  return (
    <div className="stack">
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          在庫 MVP（AUT-38）：原料・出入庫・低在庫・簡易 BOM。負在庫は拒否（409）。店舗は
          activeStoreId で隔離。粗算は売上記録×BOM（リアルタイム自動減算なし）。
        </p>
        <div className="row" style={{ marginTop: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "btn" : "btn secondary"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {msg ? (
          <p style={{ marginTop: "0.75rem", color: msg.includes("不足") || msg.includes("失敗") ? "#b00020" : "#0E8F52" }}>
            {msg}
          </p>
        ) : null}
      </div>

      {tab === "ingredients" ? (
        <div className="stack">
          {canEdit ? (
            <div className="card stack">
              <h3 style={{ margin: 0 }}>原料を追加</h3>
              <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
                <input
                  placeholder="名称"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ minWidth: 140 }}
                />
                <select value={unit} onChange={(e) => setUnit(e.target.value as "g" | "ml" | "pc")}>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="pc">pc</option>
                </select>
                <label>
                  低在庫閾値{" "}
                  <input
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    style={{ width: 100 }}
                  />
                </label>
                <label>
                  原価円/単位{" "}
                  <input
                    type="number"
                    value={cost}
                    onChange={(e) => setCost(Number(e.target.value))}
                    style={{ width: 100 }}
                  />
                </label>
                <button type="button" className="btn" disabled={busy || !name} onClick={() => void createIngredient()}>
                  登録
                </button>
              </div>
            </div>
          ) : null}

          <div className="card stack">
            <h3 style={{ margin: 0 }}>原料一覧</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>単位</th>
                  <th>現在庫</th>
                  <th>閾値</th>
                  <th>原価/単位</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((i) => (
                  <tr key={i.id} style={i.isLowStock ? { background: "#fff3f0" } : undefined}>
                    <td>{i.name}</td>
                    <td>{i.unit}</td>
                    <td>
                      {i.onHand}
                      {i.isLowStock ? " ⚠" : ""}
                    </td>
                    <td>{i.lowStockThreshold}</td>
                    <td>¥{i.costYenPerUnit.toLocaleString()}</td>
                    <td>{i.active ? (i.isLowStock ? "低在庫" : "正常") : "停止"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "ledger" ? (
        <div className="stack">
          <div className="card stack">
            <h3 style={{ margin: 0 }}>入庫 / 出庫</h3>
            <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
              <select value={ledgerIngId} onChange={(e) => setLedgerIngId(e.target.value)}>
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}（現 {i.onHand}
                    {i.unit}）
                  </option>
                ))}
              </select>
              <select value={ledgerDir} onChange={(e) => setLedgerDir(e.target.value as "in" | "out")}>
                <option value="in">入庫 (+)</option>
                <option value="out">出庫 (−)</option>
              </select>
              <input
                type="number"
                min={0.001}
                step="any"
                value={ledgerQty}
                onChange={(e) => setLedgerQty(Number(e.target.value))}
                style={{ width: 100 }}
              />
              <input
                placeholder="理由"
                value={ledgerReason}
                onChange={(e) => setLedgerReason(e.target.value)}
                style={{ minWidth: 120 }}
              />
              <button type="button" className="btn" disabled={busy || !ledgerIngId} onClick={() => void postMovement()}>
                記録
              </button>
            </div>
          </div>
          <div className="card stack">
            <h3 style={{ margin: 0 }}>最近の流水</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>原料</th>
                  <th>数量</th>
                  <th>理由</th>
                  <th>担当</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</td>
                    <td>{e.ingredient?.name ?? e.ingredientId}</td>
                    <td style={{ color: e.qtyDelta < 0 ? "#b00020" : "#0E8F52" }}>
                      {e.qtyDelta > 0 ? "+" : ""}
                      {e.qtyDelta}
                      {e.ingredient?.unit ?? ""}
                    </td>
                    <td>{e.reason}</td>
                    <td>{e.createdBy?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "bom" ? (
        <div className="stack">
          {canEdit ? (
            <div className="card stack">
              <h3 style={{ margin: 0 }}>BOM 行を追加</h3>
              <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
                <select value={bomMenuId} onChange={(e) => setBomMenuId(e.target.value)}>
                  {menuItems.map((m) => (
                    <option key={m.id} value={m.id}>
                      [{m.categoryName}] {m.name}
                    </option>
                  ))}
                </select>
                <select value={bomIngId} onChange={(e) => setBomIngId(e.target.value)}>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unit})
                    </option>
                  ))}
                </select>
                <label>
                  1皿あたり{" "}
                  <input
                    type="number"
                    min={0.001}
                    step="any"
                    value={bomQty}
                    onChange={(e) => setBomQty(Number(e.target.value))}
                    style={{ width: 100 }}
                  />
                </label>
                <button type="button" className="btn" disabled={busy || !bomMenuId || !bomIngId} onClick={() => void createBom()}>
                  追加
                </button>
              </div>
            </div>
          ) : null}
          <div className="card stack">
            <h3 style={{ margin: 0 }}>BOM 一覧</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>メニュー</th>
                  <th>原料</th>
                  <th>用量/皿</th>
                  {canEdit ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {bom.map((l) => (
                  <tr key={l.id}>
                    <td>{l.menuItem?.name ?? l.menuItemId}</td>
                    <td>
                      {l.ingredient?.name ?? l.ingredientId} ({l.ingredient?.unit})
                    </td>
                    <td>{l.qtyPerItem}</td>
                    {canEdit ? (
                      <td>
                        <button type="button" className="btn ghost" disabled={busy} onClick={() => void deleteBom(l.id)}>
                          削除
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "alerts" ? (
        <div className="card stack">
          <h3 style={{ margin: 0 }}>低在庫アラート</h3>
          {alerts.length === 0 ? (
            <p className="muted">現在、閾値を下回る原料はありません。</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>原料</th>
                  <th>現在庫</th>
                  <th>閾値</th>
                  <th>不足</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>
                      {a.onHand}
                      {a.unit}
                    </td>
                    <td>
                      {a.lowStockThreshold}
                      {a.unit}
                    </td>
                    <td style={{ color: "#b00020" }}>
                      {(a.lowStockThreshold - a.onHand).toFixed(1)}
                      {a.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {tab === "usage" ? (
        <div className="card stack">
          <h3 style={{ margin: 0 }}>粗算耗用（売上記録 × BOM）</h3>
          <p className="muted" style={{ margin: 0 }}>
            精算済み伝票の販売数 × BOM。リアルタイム自動減算ではありません（非同期見積）。
          </p>
          <button type="button" className="btn" disabled={busy} onClick={() => void loadUsage()}>
            直近7日を粗算
          </button>
          {usage ? (
            <>
              <div className="muted">
                期間: {usage.from} 〜 {usage.to}（Asia/Tokyo）
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>原料</th>
                    <th>推定使用量</th>
                    <th>内訳</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.ingredients.length === 0 ? (
                    <tr>
                      <td colSpan={3}>該当期間の売上×BOM データがありません</td>
                    </tr>
                  ) : (
                    usage.ingredients.map((u) => (
                      <tr key={u.ingredientName}>
                        <td>{u.ingredientName}</td>
                        <td>
                          {u.estimatedQty}
                          {u.unit}
                        </td>
                        <td className="muted">
                          {u.byMenuItem
                            .map((b) => `${b.menuItemName}×${b.soldQty}=${b.usage}${u.unit}`)
                            .join(" · ")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
