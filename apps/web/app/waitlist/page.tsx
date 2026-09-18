import { WaitlistJoinClient } from "./WaitlistJoinClient";

export default function WaitlistPage() {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", padding: "1rem", background: "#f4f6f5" }}>
      <h1 style={{ color: "#0e8f52" }}>シンソウデモ店</h1>
      <p className="muted">候位取号（LINE 通知は stub）</p>
      <WaitlistJoinClient />
    </div>
  );
}
