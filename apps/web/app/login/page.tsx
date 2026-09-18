"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("floor@shinso.demo");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "ログインに失敗しました");
      return;
    }
    const role = data.staff.role as string;
    if (role === "kitchen") router.push("/kitchen");
    else if (role === "owner") router.push("/admin");
    else router.push("/pos");
    router.refresh();
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1rem" }}>
      <form className="card stack" style={{ width: "min(420px, 100%)" }} onSubmit={onSubmit}>
        <div>
          <div style={{ color: "var(--brand)", fontWeight: 800, fontSize: "1.4rem" }}>SHINSO</div>
          <h1 style={{ margin: "0.25rem 0 0" }}>スタッフログイン</h1>
          <p className="muted">デモ店の前厅 POS / キッチン</p>
        </div>
        <label className="stack" style={{ gap: "0.35rem" }}>
          <span>メール</span>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="stack" style={{ gap: "0.35rem" }}>
          <span>パスワード</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : null}
        <button className="btn" disabled={loading} type="submit">
          {loading ? "ログイン中…" : "ログイン"}
        </button>
        <div className="muted" style={{ fontSize: "0.85rem" }}>
          floor@shinso.demo / demo1234
        </div>
      </form>
    </div>
  );
}
