-- CreateEnum
CREATE TYPE "app"."InstrumentType" AS ENUM ('stock', 'etf', 'fund', 'bond', 'cash', 'crypto', 'option', 'other', 'unknown');

-- AlterTable
ALTER TABLE "app"."investment_holdings" ADD COLUMN     "ibkr_sub_category" TEXT;

-- CreateTable
CREATE TABLE "app"."instrument_type_overrides" (
    "user_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "instrument_type" "app"."InstrumentType" NOT NULL,

    CONSTRAINT "instrument_type_overrides_pkey" PRIMARY KEY ("user_id","symbol")
);

-- AddForeignKey
ALTER TABLE "app"."instrument_type_overrides" ADD CONSTRAINT "instrument_type_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

