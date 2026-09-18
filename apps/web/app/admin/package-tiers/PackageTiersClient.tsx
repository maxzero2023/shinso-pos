"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import {
  CSV_PATH,
  DOC_PATH,
  LOCKED_DECISIONS,
  MATRIX_SECTIONS,
  TIER_BLURBS,
  type TierMark,
} from "@/lib/package-tiers";

const badgeBase: CSSProperties = {
  display: "inline-block",
  minWidth: "2.5rem",
  textAlign: "center",
  padding: "0.15rem 0.45rem",
  borderRadius: 4,
  fontSize: "0.85rem",
  fontWeight: 600,
};

function badgeStyle(m: TierMark): CSSProperties {
  if (m === "含") return { ...badgeBase, background: "#e6f6ee", color: "#0e8f52" };
  if (m === "加购") return { ...badgeBase, background: "#fff7e6", color: "#b45309" };
  if (m === "不含") return { ...badgeBase, background: "#f3f4f6", color: "#6b7280" };
  return { ...badgeBase, background: "#f3f4f6", color: "#9ca3af" };
}

function Mark({ m }: { m: TierMark }) {
  return <span style={badgeStyle(m)}>{m}</span>;
}

export function PackageTiersClient() {
  return (
    <div className="stack">
      <div className="card stack">
        <p style={{ margin: 0 }}>
          套餐能力境界の<strong>読み取り専用</strong>プレビュー（AUT-45）。価格・契約文言は含みません。正本はリポジトリの{" "}
          <code>{DOC_PATH}</code>（CSV: <code>{CSV_PATH}</code>）。
        </p>
        <p className="muted" style={{ margin: 0 }}>
          販売/実施のサインオフはプロダクト側レビュー待ち。未計画機能は約束しません。
        </p>
        <div className="row">
          <Link className="btn secondary" href="/admin">
            ← 店舗管理
          </Link>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>凡例</h3>
        <div className="row" style={{ gap: "1rem", flexWrap: "wrap" }}>
          <span>
            <Mark m="含" /> 当該プランに含む
          </span>
          <span>
            <Mark m="不含" /> 含まない
          </span>
          <span>
            <Mark m="加购" /> オプション加購
          </span>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>ロック済み決定</h3>
        <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
          {LOCKED_DECISIONS.map((d) => (
            <li key={d.id}>
              <strong>{d.id}</strong> — {d.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>プラン要約</h3>
        {TIER_BLURBS.map((t) => (
          <div key={t.tier}>
            <strong>{t.tier}</strong>
            <div className="muted">{t.blurb}</div>
          </div>
        ))}
      </div>

      {MATRIX_SECTIONS.map((sec) => (
        <div key={sec.id} className="card stack">
          <h3 style={{ margin: 0 }}>{sec.title}</h3>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>モジュール</th>
                  <th>Minimum</th>
                  <th>Standard</th>
                  <th>Full</th>
                  <th>Ticket</th>
                </tr>
              </thead>
              <tbody>
                {sec.rows.map((r) => (
                  <tr key={r.ticket + r.module}>
                    <td>{r.module}</td>
                    <td>
                      <Mark m={r.minimum} />
                    </td>
                    <td>
                      <Mark m={r.standard} />
                    </td>
                    <td>
                      <Mark m={r.full} />
                    </td>
                    <td>
                      <a href={r.ticketUrl} target="_blank" rel="noreferrer">
                        {r.ticket}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
