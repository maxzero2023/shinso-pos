-- AUT-36 / AUT-93: trilingual menu names (name remains Japanese primary)
ALTER TABLE "MenuCategory" ADD COLUMN "nameZh" TEXT;
ALTER TABLE "MenuCategory" ADD COLUMN "nameEn" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN "nameZh" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN "nameEn" TEXT;
