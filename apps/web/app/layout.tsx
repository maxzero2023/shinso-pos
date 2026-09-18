import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SHINSO 前厅 POS",
  description: "開台・点餐・厨打・結帳 MVP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
