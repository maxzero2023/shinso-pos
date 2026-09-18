import type { Locale } from "@shinso/api";

export type MessageKey =
  | "guestOrder"
  | "staffOrder"
  | "table"
  | "check"
  | "currentTotal"
  | "loading"
  | "menuLoadFailed"
  | "orderFailed"
  | "orderAccepted"
  | "submitCart"
  | "noOpenCheck"
  | "askStaff"
  | "added"
  | "selectTable"
  | "toPos"
  | "language"
  | "emptyMenu"
  | "retry"
  | "qty"
  | "failed"
  | "openCheckRequired";

type Dict = Record<MessageKey, string>;

export const messages: Record<Locale, Dict> = {
  ja: {
    guestOrder: "ゲスト注文",
    staffOrder: "手持ち注文",
    table: "テーブル",
    check: "伝票",
    currentTotal: "現在",
    loading: "読み込み中…",
    menuLoadFailed: "メニュー取得失敗",
    orderFailed: "注文失敗",
    orderAccepted: "ご注文を受け付けました（同一伝票に追加）",
    submitCart: "カートを注文する",
    noOpenCheck: "オープン中の伝票がありません。店員にお声がけください。",
    askStaff: "店員にお声がけください",
    added: "追加しました",
    selectTable: "テーブル選択",
    toPos: "POSへ",
    language: "言語",
    emptyMenu: "メニューがありません",
    retry: "再試行",
    qty: "数量",
    failed: "失敗",
    openCheckRequired: "オープン伝票がありません。POSで開台してください。",
  },
  zh: {
    guestOrder: "客人点餐",
    staffOrder: "手持点餐",
    table: "桌号",
    check: "账单",
    currentTotal: "当前",
    loading: "加载中…",
    menuLoadFailed: "菜单加载失败",
    orderFailed: "下单失败",
    orderAccepted: "已接受订单（追加到同一账单）",
    submitCart: "提交购物车",
    noOpenCheck: "当前没有开台账单，请找服务员。",
    askStaff: "请找服务员",
    added: "已添加",
    selectTable: "选择桌台",
    toPos: "前往 POS",
    language: "语言",
    emptyMenu: "暂无菜单",
    retry: "重试",
    qty: "数量",
    failed: "失败",
    openCheckRequired: "没有开台账单，请先在 POS 开台。",
  },
  en: {
    guestOrder: "Guest order",
    staffOrder: "Handheld order",
    table: "Table",
    check: "Check",
    currentTotal: "Now",
    loading: "Loading…",
    menuLoadFailed: "Failed to load menu",
    orderFailed: "Order failed",
    orderAccepted: "Order received (added to the same check)",
    submitCart: "Place order",
    noOpenCheck: "No open check. Please ask a staff member.",
    askStaff: "Please ask a staff member",
    added: "Added",
    selectTable: "Select table",
    toPos: "To POS",
    language: "Language",
    emptyMenu: "No menu items",
    retry: "Retry",
    qty: "Qty",
    failed: "Failed",
    openCheckRequired: "No open check. Please open a table on POS first.",
  },
};

export function translate(locale: Locale, key: MessageKey): string {
  return messages[locale][key] ?? messages.ja[key] ?? key;
}
