import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding SHINSO demo izakaya...");

  // AUT-40 / AUT-109: ExpenseEntry + PurchaseOrder-related cleanup (re-seed safe)
  await prisma.expenseEntry.deleteMany();
  await prisma.purchaseOrderAudit.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.bomLine.deleteMany();
  await prisma.stockLedger.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.ownerLineDeliveryLog.deleteMany();
  await prisma.ownerLineBinding.deleteMany();
  await prisma.pointAward.deleteMany();
  await prisma.couponIssue.deleteMany();
  await prisma.couponTemplate.deleteMany();
  await prisma.member.deleteMany();
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
  await prisma.brand.deleteMany();

  // AUT-37: Brand 1—N Store (Store A = legacy demo, Store B = isolation demo)
  const brand = await prisma.brand.create({
    data: { name: "SHINSO Demo" },
  });

  const store = await prisma.store.create({
    data: { brandId: brand.id, name: "シンソウデモ店", timezone: "Asia/Tokyo" },
  });

  const storeB = await prisma.store.create({
    data: { brandId: brand.id, name: "シンソウデモ店 B", timezone: "Asia/Tokyo" },
  });

  const passwordHash = await bcrypt.hash("demo1234", 10);
  await prisma.staff.createMany({
    data: [
      {
        storeId: store.id,
        brandId: brand.id,
        email: "brandadmin@shinso.demo",
        name: "ブランド管理者",
        role: "brand_admin",
        passwordHash,
      },
      {
        storeId: store.id,
        brandId: brand.id,
        email: "owner@shinso.demo",
        name: "オーナー太郎",
        role: "owner",
        passwordHash,
      },
      {
        storeId: store.id,
        brandId: brand.id,
        email: "manager@shinso.demo",
        name: "店長A",
        role: "manager",
        passwordHash,
      },
      {
        storeId: store.id,
        brandId: brand.id,
        email: "floor@shinso.demo",
        name: "フロア花子",
        role: "floor",
        passwordHash,
      },
      {
        storeId: store.id,
        brandId: brand.id,
        email: "kitchen@shinso.demo",
        name: "キッチン次郎",
        role: "kitchen",
        passwordHash,
      },
      {
        storeId: storeB.id,
        brandId: brand.id,
        email: "manager-b@shinso.demo",
        name: "店長B",
        role: "manager",
        passwordHash,
      },
      {
        storeId: storeB.id,
        brandId: brand.id,
        email: "floor-b@shinso.demo",
        name: "フロアB",
        role: "floor",
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

  const cat = async (name: string, nameZh: string, nameEn: string, sortOrder: number) =>
    prisma.menuCategory.create({
      data: { storeId: store.id, name, nameZh, nameEn, sortOrder },
    });

  const appetizers = await cat("前菜", "前菜", "Appetizers", 1);
  const mains = await cat("主食", "主食", "Mains", 2);
  const yakitori = await cat("焼鳥", "烤串", "Yakitori", 3);
  const drinks = await cat("酒類", "酒类", "Drinks", 4);
  const desserts = await cat("デザート", "甜品", "Desserts", 5);

  type ItemDef = {
    categoryId: string;
    name: string;
    nameZh?: string;
    nameEn?: string;
    priceYen: number;
    sortOrder: number;
    description?: string;
    modifiers?: Array<{ group: string; options: Array<{ name: string; priceYen: number }> }>;
  };

  const items: ItemDef[] = [
    { categoryId: appetizers.id, name: "枝豆", nameZh: "毛豆", nameEn: "Edamame", priceYen: 480, sortOrder: 1 },
    { categoryId: appetizers.id, name: "冷奴", nameZh: "冷豆腐", nameEn: "Chilled tofu", priceYen: 420, sortOrder: 2 },
    { categoryId: appetizers.id, name: "ポテトサラダ", nameZh: "土豆沙拉", nameEn: "Potato salad", priceYen: 580, sortOrder: 3 },
    { categoryId: appetizers.id, name: "キムチ", nameZh: "泡菜", nameEn: "Kimchi", priceYen: 480, sortOrder: 4 },
    { categoryId: appetizers.id, name: "刺身三点盛り", nameZh: "刺身三点拼盘", nameEn: "Sashimi trio", priceYen: 1280, sortOrder: 5 },
    {
      categoryId: mains.id,
      name: "唐揚げ定食", nameZh: "炸鸡定食", nameEn: "Karaage set",
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
      name: "親子丼", nameZh: "亲子丼", nameEn: "Oyakodon",
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
    { categoryId: mains.id, name: "焼魚定食", nameZh: "烤鱼定食", nameEn: "Grilled fish set", priceYen: 1180, sortOrder: 3 },
    { categoryId: mains.id, name: "ラーメン", nameZh: "拉面", nameEn: "Ramen", priceYen: 850, sortOrder: 4 },
    {
      categoryId: yakitori.id,
      name: "もも", nameZh: "鸡腿肉串", nameEn: "Chicken thigh",
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
    { categoryId: yakitori.id, name: "ねぎま", nameZh: "葱鸡串", nameEn: "Negima", priceYen: 200, sortOrder: 2 },
    { categoryId: yakitori.id, name: "つくね", nameZh: "鸡肉丸", nameEn: "Tsukune", priceYen: 220, sortOrder: 3 },
    { categoryId: yakitori.id, name: "レバー", nameZh: "鸡肝", nameEn: "Liver", priceYen: 180, sortOrder: 4 },
    { categoryId: yakitori.id, name: "皮", nameZh: "鸡皮", nameEn: "Skin", priceYen: 160, sortOrder: 5 },
    { categoryId: yakitori.id, name: "ハート", nameZh: "鸡心", nameEn: "Heart", priceYen: 180, sortOrder: 6 },
    {
      categoryId: drinks.id,
      name: "生ビール", nameZh: "生啤", nameEn: "Draft beer",
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
    { categoryId: drinks.id, name: "ハイボール", nameZh: "高球威士忌", nameEn: "Highball", priceYen: 480, sortOrder: 2 },
    { categoryId: drinks.id, name: "日本酒（一合）", nameZh: "日本酒（一合）", nameEn: "Sake (1 go)", priceYen: 650, sortOrder: 3 },
    { categoryId: drinks.id, name: "レモンサワー", nameZh: "柠檬沙瓦", nameEn: "Lemon sour", priceYen: 450, sortOrder: 4 },
    {
      categoryId: drinks.id,
      name: "飲み放題（90分）", nameZh: "畅饮（90分钟）", nameEn: "All-you-can-drink (90 min)",
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
    { categoryId: drinks.id, name: "烏龍茶", nameZh: "乌龙茶", nameEn: "Oolong tea", priceYen: 300, sortOrder: 6 },
    { categoryId: desserts.id, name: "わらび餅", nameZh: "蕨饼", nameEn: "Warabi mochi", priceYen: 480, sortOrder: 1 },
    { categoryId: desserts.id, name: "アイスクリーム", nameZh: "冰淇淋", nameEn: "Ice cream", priceYen: 380, sortOrder: 2 },
  ];

  for (const def of items) {
    const created = await prisma.menuItem.create({
      data: {
        categoryId: def.categoryId,
        name: def.name,
        nameZh: def.nameZh ?? null,
        nameEn: def.nameEn ?? null,
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


  // AUT-32 / AUT-78: multi-hour paid checks for reports demo (Asia/Tokyo paidAt)
  const menuItems = await prisma.menuItem.findMany({
    where: { category: { storeId: store.id }, active: true },
    orderBy: { sortOrder: "asc" },
  });
  const byName = (n: string) => menuItems.find((m) => m.name === n)!;
  const edamame = byName("枝豆");
  const karaage = byName("唐揚げ定食");
  const beer = byName("生ビール");
  const momo = byName("もも");
  const highball = byName("ハイボール");
  const warabi = byName("わらび餅");

  const c1 = tables.find((t) => t.code === "C1")!;
  const c2 = tables.find((t) => t.code === "C2")!;
  const t3 = tables.find((t) => t.code === "T3")!;
  const t5 = tables.find((t) => t.code === "T5")!;
  const openShift = await prisma.shift.findFirst({
    where: { storeId: store.id, status: "open" },
  });

  type PaidSeed = {
    tableId: string;
    paidHm: string;
    guestCount: number;
    method: "cash" | "card" | "paypay";
    lines: Array<{ item: typeof edamame; qty: number }>;
  };

  const paidSeeds: PaidSeed[] = [
    {
      tableId: c1.id,
      paidHm: "12:15",
      guestCount: 1,
      method: "cash",
      lines: [
        { item: edamame, qty: 1 },
        { item: beer, qty: 1 },
      ],
    },
    {
      tableId: c2.id,
      paidHm: "14:40",
      guestCount: 2,
      method: "paypay",
      lines: [
        { item: karaage, qty: 2 },
        { item: beer, qty: 2 },
        { item: momo, qty: 3 },
      ],
    },
    {
      tableId: t3.id,
      paidHm: "18:20",
      guestCount: 4,
      method: "card",
      lines: [
        { item: edamame, qty: 2 },
        { item: karaage, qty: 1 },
        { item: beer, qty: 4 },
        { item: highball, qty: 2 },
        { item: momo, qty: 6 },
      ],
    },
    {
      tableId: t5.id,
      paidHm: "20:05",
      guestCount: 3,
      method: "paypay",
      lines: [
        { item: beer, qty: 3 },
        { item: momo, qty: 4 },
        { item: warabi, qty: 2 },
      ],
    },
    {
      tableId: c1.id,
      paidHm: "21:30",
      guestCount: 2,
      method: "cash",
      lines: [
        { item: highball, qty: 2 },
        { item: momo, qty: 2 },
      ],
    },
  ];

  for (const seed of paidSeeds) {
    const paidAt = atTokyo(seed.paidHm);
    const openedAt = new Date(paidAt.getTime() - 45 * 60_000);
    const check = await prisma.check.create({
      data: {
        tableId: seed.tableId,
        status: "paid",
        guestCount: seed.guestCount,
        openedAt,
        closedAt: paidAt,
        businessDayId: businessDay.id,
        shiftId: openShift?.id,
        items: {
          create: seed.lines.map((l) => ({
            menuItemId: l.item.id,
            name: l.item.name,
            unitPriceYen: l.item.priceYen,
            qty: l.qty,
            status: "fired",
            modifiers: [],
          })),
        },
      },
      include: { items: true },
    });
    const amountYen = check.items.reduce(
      (s, i) => s + i.unitPriceYen * i.qty,
      0
    );
    await prisma.payment.create({
      data: {
        checkId: check.id,
        method: seed.method,
        amountYen,
        mock: true,
        status: "succeeded",
        provider: "mock",
        paidAt,
      },
    });
  }

  // Void check — must NOT appear in reports
  const voidPaidAt = atTokyo("19:00");
  const voidCheck = await prisma.check.create({
    data: {
      tableId: c2.id,
      status: "void",
      guestCount: 1,
      openedAt: new Date(voidPaidAt.getTime() - 30 * 60_000),
      closedAt: voidPaidAt,
      businessDayId: businessDay.id,
      shiftId: openShift?.id,
      note: "AUT-32 seed: void excluded from reports",
      items: {
        create: [
          {
            menuItemId: beer.id,
            name: beer.name,
            unitPriceYen: beer.priceYen,
            qty: 1,
            status: "void",
            modifiers: [],
          },
        ],
      },
    },
  });
  void voidCheck;

  const paidCheckCount = await prisma.check.count({
    where: { status: "paid", table: { area: { storeId: store.id } } },
  });
  console.log(`Paid checks (reports seed): ${paidCheckCount} across hours 12/14/18/20/21`);


  // AUT-33 / AUT-79–81: LINE CRM sandbox
  const memberA = await prisma.member.create({
    data: {
      storeId: store.id,
      lineUserId: "sim_demo_taro",
      displayName: "デモ太郎",
      points: 0,
    },
  });
  const memberB = await prisma.member.create({
    data: {
      storeId: store.id,
      lineUserId: "sim_demo_hanako",
      displayName: "デモ花子",
      points: 50,
    },
  });

  const tplDrink = await prisma.couponTemplate.create({
    data: {
      storeId: store.id,
      name: "ドリンク1杯無料",
      description: "ソフトドリンクまたは生ビール1杯相当（¥500）",
      discountYen: 500,
      pointsCost: 0,
      active: true,
    },
  });
  const tplDessert = await prisma.couponTemplate.create({
    data: {
      storeId: store.id,
      name: "デザート割引",
      description: "わらび餅などデザート ¥300 OFF",
      discountYen: 300,
      pointsCost: 30,
      active: true,
    },
  });

  const couponIssued = await prisma.couponIssue.create({
    data: {
      storeId: store.id,
      templateId: tplDrink.id,
      memberId: memberA.id,
      code: "CPDEMO01",
      status: "issued",
    },
  });
  void couponIssued;
  void memberB;
  void tplDessert;

  // Attach memberA to one paid seed check + award points (idempotent path)
  const paidForPoints = await prisma.check.findFirst({
    where: { status: "paid", table: { area: { storeId: store.id } } },
    include: { payments: { where: { status: "succeeded" } } },
    orderBy: { closedAt: "asc" },
  });
  if (paidForPoints) {
    await prisma.check.update({
      where: { id: paidForPoints.id },
      data: { memberId: memberA.id },
    });
    const amountYen = paidForPoints.payments.reduce((s, p) => s + p.amountYen, 0);
    const pts = Math.floor(amountYen / 100);
    if (pts > 0) {
      await prisma.pointAward.create({
        data: {
          storeId: store.id,
          memberId: memberA.id,
          checkId: paidForPoints.id,
          points: pts,
          amountYen,
        },
      });
      await prisma.member.update({
        where: { id: memberA.id },
        data: { points: { increment: pts } },
      });
    }
  }


  // AUT-34: yesterday paid checks for daily digest + owner LINE binding
  const yesterdayYmd = (() => {
    const todayStart = new Date(`${todayYmd}T00:00:00+09:00`);
    const y = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(y);
  })();
  const atTokyoYmd = (ymd: string, hm: string) =>
    new Date(`${ymd}T${hm}:00+09:00`);

  const yesterdaySeeds: PaidSeed[] = [
    {
      tableId: t3.id,
      paidHm: "12:30",
      guestCount: 2,
      method: "cash",
      lines: [
        { item: edamame, qty: 2 },
        { item: beer, qty: 2 },
      ],
    },
    {
      tableId: t5.id,
      paidHm: "19:15",
      guestCount: 4,
      method: "card",
      lines: [
        { item: karaage, qty: 2 },
        { item: beer, qty: 4 },
        { item: momo, qty: 5 },
        { item: highball, qty: 2 },
      ],
    },
    {
      tableId: c2.id,
      paidHm: "21:00",
      guestCount: 2,
      method: "paypay",
      lines: [
        { item: momo, qty: 3 },
        { item: warabi, qty: 1 },
      ],
    },
  ];

  for (const seed of yesterdaySeeds) {
    const paidAt = atTokyoYmd(yesterdayYmd, seed.paidHm);
    const openedAt = new Date(paidAt.getTime() - 40 * 60_000);
    const check = await prisma.check.create({
      data: {
        tableId: seed.tableId,
        status: "paid",
        guestCount: seed.guestCount,
        openedAt,
        closedAt: paidAt,
        note: `AUT-34 seed: yesterday ${yesterdayYmd}`,
        items: {
          create: seed.lines.map((l) => ({
            menuItemId: l.item.id,
            name: l.item.name,
            unitPriceYen: l.item.priceYen,
            qty: l.qty,
            status: "fired",
            modifiers: [],
          })),
        },
      },
      include: { items: true },
    });
    const amountYen = check.items.reduce((s, i) => s + i.unitPriceYen * i.qty, 0);
    await prisma.payment.create({
      data: {
        checkId: check.id,
        method: seed.method,
        amountYen,
        mock: true,
        status: "succeeded",
        provider: "mock",
        paidAt,
      },
    });
  }

  // Also seed 2 paid checks earlier in the same Tokyo week (for weekly digest)
  const weekDay = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(new Date(`${yesterdayYmd}T12:00:00+09:00`));
  const wdMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayNum = wdMap[weekDay] ?? 1;
  const daysFromMon = dayNum === 0 ? 6 : dayNum - 1;
  const mondayStart = new Date(`${yesterdayYmd}T00:00:00+09:00`);
  mondayStart.setTime(mondayStart.getTime() - daysFromMon * 24 * 60 * 60 * 1000);
  const mondayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(mondayStart);

  if (mondayYmd !== yesterdayYmd && mondayYmd !== todayYmd) {
    const midPaidAt = atTokyoYmd(mondayYmd, "18:00");
    const midCheck = await prisma.check.create({
      data: {
        tableId: t4!.id,
        status: "paid",
        guestCount: 3,
        openedAt: new Date(midPaidAt.getTime() - 50 * 60_000),
        closedAt: midPaidAt,
        note: `AUT-34 seed: week Monday ${mondayYmd}`,
        items: {
          create: [
            {
              menuItemId: beer.id,
              name: beer.name,
              unitPriceYen: beer.priceYen,
              qty: 3,
              status: "fired",
              modifiers: [],
            },
            {
              menuItemId: momo.id,
              name: momo.name,
              unitPriceYen: momo.priceYen,
              qty: 4,
              status: "fired",
              modifiers: [],
            },
          ],
        },
      },
      include: { items: true },
    });
    const midYen = midCheck.items.reduce((s, i) => s + i.unitPriceYen * i.qty, 0);
    await prisma.payment.create({
      data: {
        checkId: midCheck.id,
        method: "cash",
        amountYen: midYen,
        mock: true,
        status: "succeeded",
        provider: "mock",
        paidAt: midPaidAt,
      },
    });
  }

  const ownerBinding = await prisma.ownerLineBinding.create({
    data: {
      storeId: store.id,
      lineUserId: "sim_owner_line",
      dailyEnabled: true,
      weeklyEnabled: true,
    },
  });
  void ownerBinding;

  const yPaid = await prisma.check.count({
    where: {
      status: "paid",
      note: { contains: "AUT-34 seed: yesterday" },
    },
  });
  console.log(
    `Owner LINE: sim_owner_line (daily/weekly ON); yesterday(${yesterdayYmd}) paid checks: ${yPaid}`
  );


  // AUT-38 / AUT-98–101: Inventory MVP — ingredients, ledger, BOM (Store A)
  const ingChicken = await prisma.ingredient.create({
    data: {
      storeId: store.id,
      name: "鶏もも肉",
      unit: "g",
      lowStockThreshold: 2000,
      costYenPerUnit: 2,
    },
  });
  const ingBeer = await prisma.ingredient.create({
    data: {
      storeId: store.id,
      name: "生ビール原液",
      unit: "ml",
      lowStockThreshold: 5000,
      costYenPerUnit: 1,
    },
  });
  const ingEdamame = await prisma.ingredient.create({
    data: {
      storeId: store.id,
      name: "枝豆（冷凍）",
      unit: "g",
      lowStockThreshold: 1500,
      costYenPerUnit: 1,
    },
  });
  const ingSkewer = await prisma.ingredient.create({
    data: {
      storeId: store.id,
      name: "串竹",
      unit: "pc",
      lowStockThreshold: 50,
      costYenPerUnit: 3,
    },
  });
  const ownerStaff = await prisma.staff.findFirst({
    where: { email: "owner@shinso.demo" },
  });

  // Sample ledger: inbound then partial outbound (edamame left low for alert demo)
  await prisma.stockLedger.createMany({
    data: [
      {
        ingredientId: ingChicken.id,
        qtyDelta: 10000,
        reason: "inbound",
        createdById: ownerStaff?.id,
      },
      {
        ingredientId: ingBeer.id,
        qtyDelta: 20000,
        reason: "inbound",
        createdById: ownerStaff?.id,
      },
      {
        ingredientId: ingEdamame.id,
        qtyDelta: 3000,
        reason: "inbound",
        createdById: ownerStaff?.id,
      },
      {
        ingredientId: ingEdamame.id,
        qtyDelta: -2000,
        reason: "outbound",
        createdById: ownerStaff?.id,
      },
      {
        ingredientId: ingSkewer.id,
        qtyDelta: 200,
        reason: "inbound",
        createdById: ownerStaff?.id,
      },
    ],
  });
  // After seed: edamame onHand=1000 < threshold 1500 → low-stock alert

  const menuByName = Object.fromEntries(
    (
      await prisma.menuItem.findMany({
        where: { category: { storeId: store.id } },
        select: { id: true, name: true },
      })
    ).map((m) => [m.name, m.id])
  );

  const bomDefs: Array<{ menu: string; ingredientId: string; qty: number }> = [
    { menu: "もも", ingredientId: ingChicken.id, qty: 40 },
    { menu: "もも", ingredientId: ingSkewer.id, qty: 1 },
    { menu: "ねぎま", ingredientId: ingChicken.id, qty: 35 },
    { menu: "ねぎま", ingredientId: ingSkewer.id, qty: 1 },
    { menu: "枝豆", ingredientId: ingEdamame.id, qty: 150 },
    { menu: "生ビール", ingredientId: ingBeer.id, qty: 350 },
    { menu: "唐揚げ定食", ingredientId: ingChicken.id, qty: 200 },
  ];
  for (const b of bomDefs) {
    const menuItemId = menuByName[b.menu];
    if (!menuItemId) {
      console.warn(`BOM skip: menu item not found: ${b.menu}`);
      continue;
    }
    await prisma.bomLine.create({
      data: {
        menuItemId,
        ingredientId: b.ingredientId,
        qtyPerItem: b.qty,
      },
    });
  }

  const ingCount = await prisma.ingredient.count({ where: { storeId: store.id } });
  const bomCount = await prisma.bomLine.count({
    where: { ingredient: { storeId: store.id } },
  });
  console.log(
    `Inventory Store A: ${ingCount} ingredients, ${bomCount} BOM lines; edamame seeded low-stock`
  );

  // AUT-39 / AUT-102–105: Purchasing — default supplier + optional draft from low-stock
  const supplierA = await prisma.supplier.create({
    data: { storeId: store.id, name: "デフォルト仕入先" },
  });
  const supplierB = await prisma.supplier.create({
    data: { storeId: storeB.id, name: "デフォルト仕入先" },
  });
  // Demo draft left for UI path; suggestions API will show edamame (onHand 1000 < 1500 → qty 500)
  console.log(
    `Purchasing: suppliers A=${supplierA.name}, B=${supplierB.name}; edamame suggestedQty=500`
  );

  // AUT-40 / AUT-109: sample expenses (management estimate, not statutory)
  // reuse ownerStaff from inventory seed above
  const todayYmdExpense = tokyoDateStr;
  await prisma.expenseEntry.createMany({
    data: [
      {
        storeId: store.id,
        date: new Date(`${todayYmdExpense}T00:00:00.000Z`),
        amountYen: 8000,
        category: "光熱費",
        label: "電気代概算",
        note: "seed デモ（経営分析用）",
        createdById: ownerStaff?.id,
      },
      {
        storeId: store.id,
        date: new Date(`${yesterdayYmd}T00:00:00.000Z`),
        amountYen: 3500,
        category: "消耗品",
        label: "ラップ・洗剤",
        note: "seed デモ",
        createdById: ownerStaff?.id,
      },
      {
        storeId: storeB.id,
        date: new Date(`${todayYmdExpense}T00:00:00.000Z`),
        amountYen: 1200,
        category: "その他",
        label: "Store B 隔離デモ",
        note: "店舗隔離確認用",
      },
    ],
  });
  const expenseCount = await prisma.expenseEntry.count({ where: { storeId: store.id } });
  console.log(`Finance expenses Store A: ${expenseCount} (demo; 非法定帳務)`);

  // AUT-37 / AUT-96: Store B minimal isolated menu + tables
  const areaB = await prisma.area.create({
    data: { storeId: storeB.id, name: "テーブルB", sortOrder: 1 },
  });
  await prisma.table.createMany({
    data: [
      { areaId: areaB.id, code: "B1", seats: 4, sortOrder: 1 },
      { areaId: areaB.id, code: "B2", seats: 4, sortOrder: 2 },
      { areaId: areaB.id, code: "B3", seats: 6, sortOrder: 3 },
    ],
  });
  const catB = await prisma.menuCategory.create({
    data: {
      storeId: storeB.id,
      name: "B店メニュー",
      nameZh: "B店菜单",
      nameEn: "Store B Menu",
      sortOrder: 1,
    },
  });
  await prisma.menuItem.createMany({
    data: [
      {
        categoryId: catB.id,
        name: "B店限定定食",
        nameZh: "B店限定定食",
        nameEn: "Store B Set",
        priceYen: 1100,
        sortOrder: 1,
      },
      {
        categoryId: catB.id,
        name: "B店生ビール",
        nameZh: "B店生啤",
        nameEn: "Store B Draft",
        priceYen: 600,
        sortOrder: 2,
      },
    ],
  });
  const ownerB = await prisma.staff.findFirst({
    where: { storeId: storeB.id, role: "manager" },
  });
  const bdB = await prisma.businessDay.create({
    data: {
      storeId: storeB.id,
      businessDate,
      status: "open",
      openedByStaffId: ownerB?.id,
    },
  });
  await prisma.shift.create({
    data: {
      storeId: storeB.id,
      businessDayId: bdB.id,
      status: "open",
      openedByStaffId: ownerB?.id,
      note: "Store B デモ開班",
    },
  });

  // AUT-38: Store B isolated ingredient + inbound
  const chickenB = await prisma.ingredient.create({
    data: {
      storeId: storeB.id,
      name: "鶏もも肉",
      unit: "g",
      lowStockThreshold: 1000,
      costYenPerUnit: 2,
    },
  });
  await prisma.stockLedger.create({
    data: {
      ingredientId: chickenB.id,
      qtyDelta: 5000,
      reason: "inbound",
    },
  });
  console.log(`Inventory Store B: ingredient 鶏もも肉 (isolated, onHand 5000)`);

    const memberCount = await prisma.member.count({ where: { storeId: store.id } });
  const tplCount = await prisma.couponTemplate.count({ where: { storeId: store.id } });
  console.log(`CRM members: ${memberCount}, coupon templates: ${tplCount}, demo coupon CPDEMO01`);

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
  const storeBTables = await prisma.table.count({ where: { area: { storeId: storeB.id } } });
  const storeBItems = await prisma.menuItem.count({
    where: { category: { storeId: storeB.id } },
  });
  console.log(`Brand: ${brand.name}`);
  console.log(`Store A: ${store.name} / Store B: ${storeB.name} (tables ${storeBTables}, items ${storeBItems})`);
  console.log(
    "Accounts: brandadmin@ / owner@ / manager@ / floor@ / kitchen@ / manager-b@ / floor-b@ shinso.demo  password: demo1234"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
