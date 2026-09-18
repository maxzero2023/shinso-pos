import { WaitlistStatusClient } from "./WaitlistStatusClient";

export default async function WaitlistStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div
      style={{
        maxWidth: 480,
        margin: "0 auto",
        minHeight: "100vh",
        padding: "1rem",
        background: "#f4f6f5",
      }}
    >
      <h1 style={{ color: "#0e8f52", marginBottom: 4 }}>シンソウデモ店</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        候位ステータス
      </p>
      <WaitlistStatusClient id={id} />
    </div>
  );
}
