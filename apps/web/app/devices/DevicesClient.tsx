"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

type Device = {
  id: string;
  type: "t1_pos" | "kitchen_display" | "printer";
  name: string;
  code: string;
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

const TYPE_LABEL: Record<Device["type"], string> = {
  t1_pos: "T1 POS",
  kitchen_display: "厨房ディスプレイ",
  printer: "プリンタ",
};

const STATUS_LABEL: Record<Device["status"], string> = {
  online: "オンライン",
  offline: "オフライン",
  out_of_paper: "用紙切れ",
  error: "エラー",
};

function statusStyle(status: Device["status"]): CSSProperties {
  if (status === "online") return { background: "#e8f5e9", color: "#2e7d32" };
  if (status === "out_of_paper") return { background: "#fff3e0", color: "#ef6c00" };
  if (status === "error") return { background: "#fce4ec", color: "#c2185b" };
  return { background: "#eceff1", color: "#546e7a" };
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

  async function registerDefaults() {
    setBusy(true);
    setMsg("");
    const pack = [
      { type: "t1_pos", name: "SHINSO T1", code: "T1-01" },
      { type: "kitchen_display", name: "厨房ディスプレイ", code: "KDS-01" },
      { type: "printer", name: "80mm レシートプリンタ", code: "PRT-01" },
    ];
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
    setMsg("標準ハードウェア包を登録しました（既存はスキップ）");
    await refresh();
  }

  const printer = devices.find((d) => d.type === "printer");

  return (
    <div className="stack">
      <div className="card row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <strong>HARDWARE_MODE</strong>: <span className="badge open">{mode}</span>
          <div className="muted" style={{ marginTop: 4, fontSize: "0.9rem" }}>
            シミュレータで T1 / 厨屏 / プリンタをデモ。純 Web はハード無しでも動作します。
          </div>
        </div>
        <div className="row">
          <a className="btn secondary" href="/pos?device=t1">
            T1 画面
          </a>
          <a className="btn secondary" href="/kitchen?device=display">
            厨屏フルスクリーン
          </a>
          <button className="btn" type="button" disabled={busy} onClick={registerDefaults}>
            三件套を登録
          </button>
        </div>
      </div>

      {msg ? <div className="card">{msg}</div> : null}

      {printer?.printError ? (
        <div
          className="card"
          style={{ background: "#fdecea", borderColor: "var(--danger)", color: "#c62828" }}
        >
          <strong>プリンタ障害:</strong> {printer.printError}
        </div>
      ) : null}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {devices.map((d) => (
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
              {d.type === "printer" ? (
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
        ))}
      </div>

      {devices.length === 0 ? (
        <div className="card muted">端末がありません。Seed するか「三件套を登録」を押してください。</div>
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
