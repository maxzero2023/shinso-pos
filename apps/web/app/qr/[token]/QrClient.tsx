"use client";

import { useCallback, useEffect, useState } from "react";
import { LocaleProvider, useLocale } from "@/lib/i18n/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

type MenuCategory = {
  id: string;
  name: string;
  displayName?: string;
  items: Array<{
    id: string;
    name: string;
    displayName?: string;
    priceYen: number;
    description?: string | null;
  }>;
};

function QrClientInner({ token }: { token: string }) {
  const { locale, t, ready } = useLocale();
  const [tableCode, setTableCode] = useState("");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [checkTotal, setCheckTotal] = useState<number | null>(null);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [noOpenCheck, setNoOpenCheck] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNoOpenCheck(false);
    try {
      const menuRes = await fetch(`/api/qr/${token}/menu?locale=${locale}`);
      const menuData = await menuRes.json();
      if (!menuRes.ok) {
        setError(menuData.error ?? t("menuLoadFailed"));
        setCategories([]);
        return;
      }
      setTableCode(menuData.table.code);
      setCategories(menuData.categories ?? []);

      const checkRes = await fetch(`/api/qr/${token}/check`);
      const checkData = await checkRes.json();
      if (checkRes.ok) {
        setCheckTotal(checkData.check.totalYen);
        setCheckId(checkData.check.id);
      } else if (checkRes.status === 409) {
        setNoOpenCheck(true);
        setCheckId(null);
        setCheckTotal(null);
        setError(t("noOpenCheck"));
      }
    } catch {
      setError(t("menuLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, locale, t]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

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
    if (noOpenCheck) {
      setError(t("noOpenCheck"));
      return;
    }
    for (const [menuItemId, qty] of entries) {
      const res = await fetch(`/api/qr/${token}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuItemId, qty, modifierIds: [] }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setNoOpenCheck(true);
          setError(t("noOpenCheck"));
        } else {
          setError(data.error ?? t("orderFailed"));
        }
        return;
      }
      setCheckId(data.checkId);
    }
    setCart({});
    setMsg(t("orderAccepted"));
    const checkRes = await fetch(`/api/qr/${token}/check`);
    const checkData = await checkRes.json();
    if (checkRes.ok) setCheckTotal(checkData.check.totalYen);
  }

  if (loading) {
    return (
      <div className="mobile-shell stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ color: "var(--brand)", fontWeight: 800 }}>{t("guestOrder")}</div>
          <LanguageSwitcher />
        </div>
        <div className="card muted">{t("loading")}</div>
      </div>
    );
  }

  if (error && !categories.length) {
    return (
      <div className="mobile-shell stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ color: "var(--brand)", fontWeight: 800 }}>{t("guestOrder")}</div>
          <LanguageSwitcher />
        </div>
        <div className="card" style={{ color: "var(--danger)" }}>
          {error}
        </div>
        <button className="btn secondary touch-target" type="button" onClick={() => void load()}>
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-shell stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ color: "var(--brand)", fontWeight: 800 }}>{t("guestOrder")}</div>
          <h1 style={{ margin: "0.2rem 0" }}>
            {t("table")} {tableCode}
          </h1>
          {checkId ? (
            <div className="muted">
              {t("check")} {checkId.slice(-6)} / {t("currentTotal")} ¥
              {(checkTotal ?? 0).toLocaleString()}
            </div>
          ) : null}
        </div>
        <LanguageSwitcher />
      </div>
      {error ? (
        <div className="card" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}
      {msg ? <div className="card">{msg}</div> : null}
      {!categories.length ? (
        <div className="card muted">{t("emptyMenu")}</div>
      ) : (
        categories.map((c) => (
          <div key={c.id} className="card stack">
            <strong>{c.displayName ?? c.name}</strong>
            {c.items.map((item) => (
              <div key={item.id} className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div>{item.displayName ?? item.name}</div>
                  <div className="muted">¥{item.priceYen.toLocaleString()}</div>
                </div>
                <div className="row qty-controls">
                  <button
                    className="btn ghost touch-target"
                    type="button"
                    aria-label="−"
                    onClick={() => bump(item.id, -1)}
                  >
                    −
                  </button>
                  <span aria-label={t("qty")}>{cart[item.id] ?? 0}</span>
                  <button
                    className="btn ghost touch-target"
                    type="button"
                    aria-label="＋"
                    onClick={() => bump(item.id, 1)}
                  >
                    ＋
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
      <button
        className="btn touch-target"
        type="button"
        disabled={!Object.keys(cart).length || noOpenCheck}
        onClick={() => void submit()}
        style={{ position: "sticky", bottom: 12 }}
      >
        {t("submitCart")}
      </button>
    </div>
  );
}

export function QrClient({ token }: { token: string }) {
  return (
    <LocaleProvider>
      <QrClientInner token={token} />
    </LocaleProvider>
  );
}
