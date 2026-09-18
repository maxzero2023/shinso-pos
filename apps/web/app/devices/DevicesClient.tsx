"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

type DeviceType =
  | "t1_pos"
  | "kitchen_display"
  | "printer"
  | "handheld_pos"
  | "kitchen_display_alt"
  | "thermal_printer_alt";

type Device = {
  id: string;
  type: DeviceType;
  name: string;
  code: string;
  pack: "standard" | "alt";
  isPrimaryStandardPack: boolean;
  status: "online" | "offline" | "out_of_paper" | "error";
  lastHeartbeatAt: string | null;
  effectivelyOffline: boolean;
  printError: string | null;
};

type PrintJob = {
  id: string;
  type: "receipt" | "kitchen";
  status: string;
  contentText: string;
  contentHtml: string | null;
  errorMessage: string | null;
  printedAt: string | null;
  createdAt: string;
  device: { id: string; code: string; name: string; status: string } | null;
};

const TYPE_LABEL: Record<DeviceType, string> = {
  t1_pos: "T1 POS",
  kitchen_display: "厨房ディスプレイ",
  printer: "プリンタ",
  handheld_pos: "ハンディ POS",
  kitchen_display_alt: "厨房ディスプレイ (alt)",
  thermal_printer_alt: "サーマル (alt)",
};

const STATUS_LABEL: Record<Device["status"], string> = {
  online: "オンライン",
  offline: "オフライン",
  out_of_paper: "用紙切れ",
  error: "エラー",
};

const STANDARD_PACK = [
  { type: "t1_pos" as const, name: "SHINSO T1", code: "T1-01", pack: "standard" as const },
  { type: "kitchen_display" as const, name: "厨房ディスプレイ", code: "KDS-01", pack: "standard" as const },
  { type: "printer" as const, name: "80mm レシートプリンタ", code: "PRT-01", pack: "standard" as const },
];

const ALT_PACK = [
  {
    type: "handheld_pos" as const,
    name: "ハンディ POS (Sunmi 系)",
    code: "HH-01",
    pack: "alt" as const,
  },
  {
    type: "kitchen_display_alt" as const,
    name: "厨房ディスプレイ (alt)",
    code: "KDS-A1",
    pack: "alt" as const,
  },
  {
    type: "thermal_printer_alt" as const,
    name: "サーマルプリンタ (alt)",
    code: "PRT-A1",
    pack: "alt" as const,
  },
];

function statusStyle(status: Device["status"]): CSSProperties {
  if (status === "online") return { background: "#e8f5e9", color: "#2e7d32" };
  if (status === "out_of_paper") return { background: "#fff3e0", color: "#ef6c00" };
  if (status === "error") return { background: "#fce4ec", color: "#c2185b" };
  return { background: "#eceff1", color: "#546e7a" };
}

function isPrinter(type: DeviceType) {
  return type === "printer" || type === "thermal_printer_alt";
}

export function DevicesClient() {
  const [mode, setMode] = useState("simulator");
  const [devices, setDevices] = useState<Device[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [preview, setPreview] = useState<PrintJob | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [dRes, jRes] = await Promise.all([
      fetch("/api/devices"),
      fetch("/api/print-jobs?limit=30"),
    ]);
    const dData = await dRes.json();
    const jData = await jRes.json();
    if (dRes.ok) {
      setDevices(dData.devices);
      setMode(dData.mode);
    }
    if (jRes.ok) setJobs(jData.jobs);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  async function heartbeat(id: string) {
    await fetch(`/api/devices/${id}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await refresh();
  }

  async function simulate(id: string, status: Device["status"]) {
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/devices/${id}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "失敗");
      return;
    }
    setMsg(`${STATUS_LABEL[status]} に設定しました`);
    await refresh();
  }

  async function retryJob(id: string) {
    setBusy(true);
    const res = await fetch(`/api/print-jobs/${id}/retry`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setMsg(data.error ?? "リトライ失敗");
    else if (data.job?.status === "failed") setMsg(data.job.errorMessage ?? "印刷失敗");
    else setMsg("再印刷成功");
    await refresh();
  }

  async function registerPack(pack: typeof STANDARD_PACK | typeof ALT_PACK, label: string) {
    setBusy(true);
    setMsg("");
    for (const d of pack) {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
      if (!res.ok && res.status !== 409) {
        const data = await res.json();
        setMsg(data.error ?? "登録失敗");
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setMsg(`${label}を登録しました（既存はスキップ）`);
    await refresh();
  }

  async function printViaAlt() {
    const alt = devices.find((d) => d.type === "thermal_printer_alt");
    if (!alt) {
      setMsg("alt プリンタがありません。第二套を登録してください。");
      return;
    }
    setBusy(true);
    setMsg("");
    const list = await fetch("/api/print-jobs?limit=50").then((r) => r.json());
    const withCheck = (list.jobs as Array<{ type: string; checkId?: string | null }>).find(
      (j) => j.type === "receipt" && j.checkId
    );
    if (!withCheck?.checkId) {
      setBusy(false);
      setMsg("checkId 付きレシートがありません。精算後に再実行してください。");
      return;
    }
    const res = await fetch("/api/print-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "receipt",
        checkId: withCheck.checkId,
        reprint: true,
        deviceId: alt.id,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "alt 印刷失敗");
      return;
    }
    const job = data.job ?? data.printJob;
    setMsg(
      `alt プリンタへ印刷: ${job?.status ?? "?"} → ${alt.code}（標準デフォルトは変更なし）`
    );
    await refresh();
  }

  const standardDevices = useMemo(
    () => devices.filter((d) => d.pack === "standard"),
    [devices]
  );
  const altDevices = useMemo(() => devices.filter((d) => d.pack === "alt"), [devices]);
  const standardPrinter = devices.find((d) => d.type === "printer" && d.pack === "standard");
  const printerError =
    standardPrinter?.printError ??
    devices.find((d) => isPrinter(d.type) && d.printError)?.printError ??
    null;

  function renderDeviceCard(d: Device) {
    return (
      <div key={d.id} className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>
            {TYPE_LABEL[d.type]} · {d.code}
          </strong>
          <span className="badge" style={statusStyle(d.status)}>
            {STATUS_LABEL[d.status]}
          </span>
        </div>
        <div className="muted" style={{ fontSize: "0.85rem" }}>
          {d.name}
          <br />
          pack: <strong>{d.pack}</strong>
          {d.isPrimaryStandardPack ? " · 標準優先" : " · 第二套"}
          <br />
          心拍:{" "}
          {d.lastHeartbeatAt
            ? new Date(d.lastHeartbeatAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
            : "—"}
          {d.effectivelyOffline ? " · 実質オフライン" : ""}
        </div>
        <div className="row">
          <button className="btn secondary" type="button" onClick={() => heartbeat(d.id)}>
            ハートビート
          </button>
        </div>
        <div className="row">
          <button className="btn" type="button" disabled={busy} onClick={() => simulate(d.id, "online")}>
            オンライン
          </button>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => simulate(d.id, "offline")}>
            オフライン
          </button>
          {isPrinter(d.type) ? (
            <button
              className="btn danger"
              type="button"
              disabled={busy}
              onClick={() => simulate(d.id, "out_of_paper")}
            >
              用紙切れ
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <strong>HARDWARE_MODE</strong>: <span className="badge open">{mode}</span>
          <div className="muted" style={{ marginTop: 4, fontSize: "0.9rem" }}>
            標準包（T1 / 厨屏 / プリンタ）+ 第二套（ハンディ / alt 厨屏 / alt サーマル）。デフォルト印刷は標準包優先。
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <a className="btn secondary" href="/pos?device=t1">
            T1 画面
          </a>
          <a className="btn secondary" href="/staff">
            ハンディ /staff
          </a>
          <a className="btn secondary" href="/kitchen?device=display">
            厨屏フルスクリーン
          </a>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => registerPack(STANDARD_PACK, "標準ハードウェア包")}
          >
            標準三件套を登録
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={busy}
            onClick={() => registerPack(ALT_PACK, "第二套ハードウェア包")}
          >
            第二套を登録
          </button>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => void printViaAlt()}>
            alt で再印刷デモ
          </button>
        </div>
      </div>

      {msg ? <div className="card">{msg}</div> : null}

      {printerError ? (
        <div
          className="card"
          style={{ background: "#fdecea", borderColor: "var(--danger)", color: "#c62828" }}
        >
          <strong>プリンタ障害:</strong> {printerError}
        </div>
      ) : null}

      <h3>標準包（Q1 / isPrimaryStandardPack）</h3>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {standardDevices.map(renderDeviceCard)}
      </div>
      {standardDevices.length === 0 ? (
        <div className="card muted">標準包がありません。「標準三件套を登録」または Seed してください。</div>
      ) : null}

      <h3>第二套（alt / 日本市場向けシミュレータ）</h3>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {altDevices.map(renderDeviceCard)}
      </div>
      {altDevices.length === 0 ? (
        <div className="card muted">第二套がありません。「第二套を登録」または Seed してください。</div>
      ) : null}

      <h3>印刷ジョブ（80mm プレビュー）</h3>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="card stack" style={{ maxHeight: 480, overflow: "auto" }}>
          {jobs.map((j) => (
            <div
              key={j.id}
              className="card"
              style={{
                cursor: "pointer",
                background: preview?.id === j.id ? "var(--brand-soft)" : undefined,
              }}
              onClick={() => setPreview(j)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setPreview(j);
              }}
              role="button"
              tabIndex={0}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>
                  {j.type === "receipt" ? "レシート" : "厨打"} · {j.status}
                </strong>
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  {new Date(j.createdAt).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" })}
                </span>
              </div>
              {j.device ? (
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  → {j.device.code} {j.device.name}
                </div>
              ) : null}
              {j.errorMessage ? (
                <div style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{j.errorMessage}</div>
              ) : null}
              {j.status === "failed" ? (
                <button
                  className="btn secondary"
                  type="button"
                  style={{ marginTop: 8 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    retryJob(j.id);
                  }}
                >
                  リトライ
                </button>
              ) : null}
            </div>
          ))}
          {jobs.length === 0 ? <div className="muted">まだ印刷ジョブがありません</div> : null}
        </div>
        <div className="card">
          <strong>プレビュー（日本 80mm / 日文）</strong>
          <div style={{ marginTop: 12 }}>
            {preview?.contentHtml ? (
              <div dangerouslySetInnerHTML={{ __html: preview.contentHtml }} />
            ) : preview ? (
              <pre className="receipt-80mm">{preview.contentText}</pre>
            ) : (
              <div className="muted">左のジョブを選択</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
