import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";
import {
  DEFAULT_LOCALE,
  localizedName,
  parseLocale,
  resolveLocaleFromRequest,
  withDisplayName,
} from "@shinso/api";
import { translate } from "../lib/i18n/messages";

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";

async function login(email: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie =
    setCookie.map((c) => c.split(";")[0]).join("; ") ||
    (res.headers.get("set-cookie") ?? "")
      .split(",")
      .map((c) => c.split(";")[0].trim())
      .join("; ");
  expect(res.status).toBe(200);
  return cookie;
}

describe("AUT-36 i18n helpers", () => {
  it("defaults locale to ja", () => {
    expect(DEFAULT_LOCALE).toBe("ja");
    expect(parseLocale(undefined)).toBe("ja");
    expect(parseLocale("ja-JP")).toBe("ja");
    expect(parseLocale("zh-CN")).toBe("zh");
    expect(parseLocale("en-US")).toBe("en");
  });

  it("menu localization fallback name → nameZh → nameEn", () => {
    const item = { name: "枝豆", nameZh: "毛豆", nameEn: "Edamame" };
    expect(localizedName(item, "ja")).toBe("枝豆");
    expect(localizedName(item, "zh")).toBe("毛豆");
    expect(localizedName(item, "en")).toBe("Edamame");
    expect(localizedName({ name: "枝豆", nameZh: null, nameEn: null }, "zh")).toBe("枝豆");
    expect(localizedName({ name: "枝豆", nameZh: null, nameEn: "Edamame" }, "en")).toBe(
      "Edamame"
    );
    expect(withDisplayName(item, "en").displayName).toBe("Edamame");
  });

  it("switcher / empty-state strings exist in ja/zh/en", () => {
    for (const locale of ["ja", "zh", "en"] as const) {
      expect(translate(locale, "noOpenCheck").length).toBeGreaterThan(5);
      expect(translate(locale, "guestOrder").length).toBeGreaterThan(1);
      expect(translate(locale, "staffOrder").length).toBeGreaterThan(1);
      expect(translate(locale, "submitCart").length).toBeGreaterThan(1);
      expect(translate(locale, "openCheckRequired").length).toBeGreaterThan(5);
      expect(translate(locale, "language").length).toBeGreaterThan(0);
    }
    expect(translate("ja", "noOpenCheck")).toMatch(/店員|スタッフ/);
    expect(translate("zh", "noOpenCheck")).toMatch(/服务员|職員/);
    expect(translate("en", "noOpenCheck").toLowerCase()).toContain("staff");
  });

  it("resolveLocaleFromRequest prefers ?locale= over Accept-Language", () => {
    const req = new Request("http://localhost/api/menu/categories?locale=en", {
      headers: { "accept-language": "zh-CN,zh;q=0.9" },
    });
    expect(resolveLocaleFromRequest(req)).toBe("en");
    const req2 = new Request("http://localhost/api/menu/categories", {
      headers: { "accept-language": "zh-CN,zh;q=0.9" },
    });
    expect(resolveLocaleFromRequest(req2)).toBe("zh");
  });
});

describe("AUT-36 menu API localization + check regression smoke", () => {
  let cookie = "";

  beforeAll(async () => {
    const store = await prisma.store.findFirst();
    expect(store).toBeTruthy();
    cookie = await login("floor@shinso.demo");
  });

  it("GET /api/menu/categories?locale= returns displayName", async () => {
    for (const locale of ["ja", "zh", "en"] as const) {
      const res = await fetch(`${BASE}/api/menu/categories?locale=${locale}`, {
        headers: { cookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.locale).toBe(locale);
      const first = data.categories?.[0];
      expect(first).toBeTruthy();
      expect(typeof first.displayName).toBe("string");
      expect(first.displayName.length).toBeGreaterThan(0);
      const item = first.items?.[0];
      expect(item?.displayName).toBeTruthy();
      if (locale === "ja") {
        expect(item.displayName).toBe(item.name);
      }
      if (locale === "zh") {
        expect(item.displayName === item.nameZh || item.displayName === item.name).toBe(true);
      }
      if (locale === "en") {
        expect(item.displayName === item.nameEn || item.displayName === item.name).toBe(true);
      }
    }
  });

  it("open check → add item still works (regression smoke)", async () => {
    const tablesRes = await fetch(`${BASE}/api/tables`, { headers: { cookie } });
    const tablesData = await tablesRes.json();
    const free = tablesData.tables.find((t: { status: string }) => t.status === "free");
    expect(free).toBeTruthy();

    const openRes = await fetch(`${BASE}/api/tables/${free.id}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ guestCount: 2 }),
    });
    const openData = await openRes.json();
    expect(openRes.status).toBe(201);
    const checkId = openData.check.id as string;

    const menuRes = await fetch(`${BASE}/api/menu/categories?locale=en`, {
      headers: { cookie },
    });
    const menuData = await menuRes.json();
    const item = menuData.categories[0].items[0];

    const addRes = await fetch(`${BASE}/api/checks/${checkId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ menuItemId: item.id, qty: 1, modifierIds: [] }),
    });
    expect(addRes.status).toBe(201);

    const fireRes = await fetch(`${BASE}/api/checks/${checkId}/fire`, {
      method: "POST",
      headers: { cookie },
    });
    expect(fireRes.status).toBe(201);

    const checkRes = await fetch(`${BASE}/api/checks/${checkId}`, { headers: { cookie } });
    const checkData = await checkRes.json();
    const total = checkData.check.totalYen as number;

    const payRes = await fetch(`${BASE}/api/checks/${checkId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ method: "paypay", amountYen: total }),
    });
    expect(payRes.status).toBe(200);
  });
});
