import { QrClient } from "./QrClient";

type Props = { params: Promise<{ token: string }> };

export default async function QrPage({ params }: Props) {
  const { token } = await params;
  return <QrClient token={token} />;
}
