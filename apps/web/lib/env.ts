export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

export function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? "shinso-dev-session-secret-change-in-prod!!";
}

export function getQrSecret(): string {
  return process.env.QR_HMAC_SECRET ?? "shinso-dev-qr-hmac-secret-change-in-prod!";
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
