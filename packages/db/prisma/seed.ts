import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding SHINSO demo izakaya...");

  await prisma.checkAuditLog.deleteMany();
  await prisma.printJob.deleteMany();
  await prisma.device.deleteMany();
  await prisma.waitlistTicket.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.kitchenTicketLine.deleteMany();
  await prisma.kitchenTicket.deleteMany();
  await prisma.checkItem.deleteMany();
  await prisma.check.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.businessDay.deleteMany();
  await prisma.menuModifier.deleteMany();
  await prisma.menuModifierGroup.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuCategory.deleteMany();
  await prisma.table.deleteMany();
  await prisma.area.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.store.deleteMany();

  const store = await prisma.store.create({
    data: { name: "シンソウデモ店", timezone: "Asia/Tokyo" },
  });

  const passwordHash = await bcrypt.hash("demo1234", 10);
  await prisma.staff.createMany({
    data: [
      {
        storeId: store.id,
        email: "owner@shinso.demo",
        name: "オーナー太郎",
        role: "owner",
        passwordHash,
      },
      {
        storeId: store.id,
        email: "floor@shinso.demo",
        name: "フロア花子",
        role: "floor",
        passwordHash,
      },
      {
        storeId: store.id,
        email: "kitchen@shinso.demo",
        name: "キッチン次郎",
        role: "kitchen",
        passwordHash,
      },
    ],
  });

  const counter = await prisma.area.create({
    data: { storeId: store.id, name: "カウンター", sortOrder: 1 },
  });
  const tableArea = await prisma.area.create({
    data: { storeId: store.id, name: "テーブル", sortOrder: 2 },
  });
  const privateArea = await prisma.area.create({
    data: { storeId: store.id, name: "個室", sortOrder: 3 },
  });

  const tableDefs: Array<{ areaId: string; code: string; seats: number; sortOrder: number }> = [
    { areaId: counter.id, code: "C1", seats: 1, sortOrder: 1 },
    { areaId: counter.id, code: "C2", seats: 1, sortOrder: 2 },
    { areaId: counter.id, code: "C3", seats: 1, sortOrder: 3 },
    { areaId: counter.id, code: "C4", seats: 2, sortOrder: 4 },
    { areaId: tableArea.id, code: "T1", seats: 4, sortOrder: 1 },
    { areaId: tableArea.id, code: "T2", seats: 4, sortOrder: 2 },
    { areaId: tableArea.id, code: "T3", seats: 4, sortOrder: 3 },
    { areaId: tableArea.id, code: "T4", seats: 6, sortOrder: 4 },
    { areaId: tableArea.id, code: "T5", seats: 6, sortOrder: 5 },
    { areaId: privateArea.id, code: "P1", seats: 8, sortOrder: 1 },
    { areaId: privateArea.id, code: "P2", seats: 8, sortOrder: 2 },
    { areaId: privateArea.id, code: "P3", seats: 10, sortOrder: 3 },
  ];
  await prisma.table.createMany({ data: tableDefs });

  const cat = async (name: string, sortOrder: number) =>
    prisma.menuCategory.create({
      data: { storeId: store.id, name, sortOrder },
    });

  const appetizers = await cat("前菜", 1);
  const mains = await cat("主食", 2);
  const yakitori = await cat("焼鳥", 3);
  const drinks = await cat("酒類", 4);
  const desserts = await cat("デザート", 5);

  type ItemDef = {
    categoryId: string;
    name: string;
    priceYen: number;
    sortOrder: number;
    description?: string;
    modifiers?: Array<{ group: string; options: Array<{ name: string; priceYen: number }> }>;
  };

  const items: ItemDef[] = [
    { categoryId: appetizers.id, name: "枝豆", priceYen: 480, sortOrder: 1 },
    { categoryId: appetizers.id, name: "冷奴", priceYen: 420, sortOrder: 2 },
    { categoryId: appetizers.id, name: "ポテトサラダ", priceYen: 580, sortOrder: 3 },
    { categoryId: appetizers.id, name: "キムチ", priceYen: 480, sortOrder: 4 },
    { categoryId: appetizers.id, name: "刺身三点盛り", priceYen: 1280, sortOrder: 5 },
    {
      categoryId: mains.id,
      name: "唐揚げ定食",
      priceYen: 980,
      sortOrder: 1,
      modifiers: [
        {
          group: "サイズ",
          options: [
            { name: "並", priceYen: 0 },
            { name: "大盛", priceYen: 200 },
          ],
        },
      ],
    },
    {
      categoryId: mains.id,
      name: "親子丼",
      priceYen: 880,
      sortOrder: 2,
      modifiers: [
        {
          group: "サイズ",
          options: [
            { name: "並", priceYen: 0 },
            { name: "大盛", priceYen: 150 },
          ],
        },
      ],
    },
    { categoryId: mains.id, name: "焼魚定食", priceYen: 1180, sortOrder: 3 },
    { categoryId: mains.id, name: "ラーメン", priceYen: 850, sortOrder: 4 },
    {
      categoryId: yakitori.id,
      name: "もも",
      priceYen: 180,
      sortOrder: 1,
      modifiers: [
        {
          group: "味",
          options: [
            { name: "塩", priceYen: 0 },
            { name: "タレ", priceYen: 0 },
            { name: "追加ソース", priceYen: 50 },
          ],
        },
      ],
    },
    { categoryId: yakitori.id, name: "ねぎま", priceYen: 200, sortOrder: 2 },
    { categoryId: yakitori.id, name: "つくね", priceYen: 220, sortOrder: 3 },
    { categoryId: yakitori.id, name: "レバー", priceYen: 180, sortOrder: 4 },
    { categoryId: yakitori.id, name: "皮", priceYen: 160, sortOrder: 5 },
    { categoryId: yakitori.id, name: "ハート", priceYen: 180, sortOrder: 6 },
    {
      categoryId: drinks.id,
      name: "生ビール",
      priceYen: 580,
      sortOrder: 1,
      modifiers: [
        {
          group: "サイズ",
          options: [
            { name: "中ジョッキ", priceYen: 0 },
            { name: "大ジョッキ", priceYen: 200 },
          ],
        },
      ],
    },
    { categoryId: drinks.id, name: "ハイボール", priceYen: 480, sortOrder: 2 },
    { categoryId: drinks.id, name: "日本酒（一合）", priceYen: 650, sortOrder: 3 },
    { categoryId: drinks.id, name: "レモンサワー", priceYen: 450, sortOrder: 4 },
    {
      categoryId: drinks.id,
      name: "飲み放題（90分）",
      priceYen: 1980,
      sortOrder: 5,
      description: "ビール・サワー・ハイボール",
      modifiers: [
        {
          group: "オプション",
          options: [
            { name: "標準", priceYen: 0 },
            { name: "飲み放題オプション（プレミアム）", priceYen: 800 },
          ],
        },
      ],
    },
    { categoryId: drinks.id, name: "烏龍茶", priceYen: 300, sortOrder: 6 },
    { categoryId: desserts.id, name: "わらび餅", priceYen: 480, sortOrder: 1 },
    { categoryId: desserts.id, name: "アイスクリーム", priceYen: 380, sortOrder: 2 },
  ];

  for (const def of items) {
    const created = await prisma.menuItem.create({
      data: {
        categoryId: def.categoryId,
        name: def.name,
        priceYen: def.priceYen,
        sortOrder: def.sortOrder,
        description: def.description,
        active: true,
      },
    });
    if (def.modifiers) {
      let gOrder = 0;
      for (const g of def.modifiers) {
        const group = await prisma.menuModifierGroup.create({
          data: {
            menuItemId: created.id,
            name: g.group,
            minSelect: 0,
            maxSelect: 1,
            sortOrder: gOrder++,
          },
        });
        let mOrder = 0;
        for (const opt of g.options) {
          await prisma.menuModifier.create({
            data: {
              groupId: group.id,
              name: opt.name,
              priceYen: opt.priceYen,
              sortOrder: mOrder++,
            },
          });
        }
      }
    }
  }

  // AUT-46: tonight reservations + waitlist (Asia/Tokyo)
  const tables = await prisma.table.findMany({
    where: { area: { storeId: store.id } },
    orderBy: [{ areaId: "asc" }, { sortOrder: "asc" }],
  });
  const t1 = tables.find((t) => t.code === "T1");
  const t2 = tables.find((t) => t.code === "T2");
  const t4 = tables.find((t) => t.code === "T4");
  const p1 = tables.find((t) => t.code === "P1");

  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const atTokyo = (hm: string) => new Date(`${todayYmd}T${hm}:00+09:00`);

  await prisma.reservation.createMany({
    data: [
      {
        storeId: store.id,
        tableId: t1?.id,
        partySize: 4,
        startAt: atTokyo("19:00"),
        endAt: atTokyo("20:30"),
        status: "confirmed",
        guestName: "山田太郎",
        guestPhone: "090-1111-2222",
        note: "窓側希望",
      },
      {
        storeId: store.id,
        tableId: t2?.id,
        partySize: 2,
        startAt: atTokyo("18:30"),
        endAt: atTokyo("20:00"),
        status: "hold",
        guestName: "佐藤花子",
        guestPhone: "080-3333-4444",
        note: "仮予約（hold ≠ open Check）",
      },
      {
        storeId: store.id,
        tableId: t4?.id,
        partySize: 6,
        startAt: atTokyo("20:00"),
        endAt: atTokyo("21:30"),
        status: "confirmed",
        guestName: "鈴木一郎",
        guestLineId: "U_demo_suzuki",
      },
      {
        storeId: store.id,
        tableId: p1?.id,
        partySize: 8,
        startAt: atTokyo("19:30"),
        endAt: atTokyo("21:30"),
        status: "confirmed",
        guestName: "田中宴会",
        note: "個室・誕生日",
      },
    ],
  });

  await prisma.waitlistTicket.createMany({
    data: [
      {
        storeId: store.id,
        partySize: 3,
        ticketNo: 1,
        status: "waiting",
        guestName: "候位・A組",
        guestPhone: "070-5555-6666",
      },
      {
        storeId: store.id,
        partySize: 2,
        ticketNo: 2,
        status: "waiting",
        guestName: "候位・B組",
      },
      {
        storeId: store.id,
        partySize: 4,
        ticketNo: 3,
        status: "called",
        guestName: "候位・C組",
        calledAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    ],
  });



  // AUT-74: today's open BusinessDay + Shift (Asia/Tokyo)
  const owner = await prisma.staff.findFirst({ where: { storeId: store.id, role: "owner" } });
  const tokyoDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const businessDate = new Date(`${tokyoDateStr}T00:00:00.000Z`);
  const businessDay = await prisma.businessDay.create({
    data: {
      storeId: store.id,
      businessDate,
      status: "open",
      openedByStaffId: owner?.id,
    },
  });
  await prisma.shift.create({
    data: {
      storeId: store.id,
      businessDayId: businessDay.id,
      status: "open",
      openedByStaffId: owner?.id,
      note: "デモ開班",
    },
  });

  // AUT-69: standard hardware pack (T1 + kitchen display + printer)
  await prisma.device.createMany({
    data: [
      {
        storeId: store.id,
        type: "t1_pos",
        name: "SHINSO T1",
        code: "T1-01",
        status: "online",
        lastHeartbeatAt: new Date(),
        meta: { model: "T1", touch: true },
      },
      {
        storeId: store.id,
        type: "kitchen_display",
        name: "厨房ディスプレイ",
        code: "KDS-01",
        status: "online",
        lastHeartbeatAt: new Date(),
        meta: { fullscreen: true },
      },
      {
        storeId: store.id,
        type: "printer",
        name: "80mm レシートプリンタ",
        code: "PRT-01",
        status: "online",
        lastHeartbeatAt: new Date(),
        meta: { paperWidthMm: 80, locale: "ja-JP" },
      },
    ],
  });

  const reservationCount = await prisma.reservation.count({ where: { storeId: store.id } });
  const waitlistCount = await prisma.waitlistTicket.count({ where: { storeId: store.id } });
  const tableCount = await prisma.table.count({ where: { area: { storeId: store.id } } });
  const itemCount = await prisma.menuItem.count({
    where: { category: { storeId: store.id } },
  });
  console.log(`Store: ${store.name}`);
  console.log(`Tables: ${tableCount}, Menu items: ${itemCount}`);
  const deviceCount = await prisma.device.count({ where: { storeId: store.id } });
  console.log(`Reservations (tonight): ${reservationCount}, Waitlist: ${waitlistCount}`);
  const shiftCount = await prisma.shift.count({ where: { storeId: store.id, status: "open" } });
  console.log(`Devices: ${deviceCount} (T1-01 / KDS-01 / PRT-01)`);
  console.log(`Open shifts: ${shiftCount} (businessDate ${tokyoDateStr})`);
  console.log("Accounts: owner@ / floor@ / kitchen@ shinso.demo  password: demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
