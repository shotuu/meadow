-- CreateEnum
CREATE TYPE "app"."BalanceCalculationMethod" AS ENUM ('transaction_sum', 'institution_reported', 'holdings_derived');

-- CreateEnum
CREATE TYPE "app"."TransferCounterpartType" AS ENUM ('transaction', 'investment_transaction');

-- CreateEnum
CREATE TYPE "app"."TransferMatchStatus" AS ENUM ('pending', 'confirmed', 'dismissed');

-- CreateEnum
CREATE TYPE "app"."ObligationFrequency" AS ENUM ('one_time', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual');

-- CreateEnum
CREATE TYPE "app"."ObligationPriority" AS ENUM ('mandatory', 'planned', 'discretionary');

-- CreateEnum
CREATE TYPE "app"."IncomeConfidence" AS ENUM ('confirmed', 'estimated');

-- AlterTable
ALTER TABLE "app"."transactions" ADD COLUMN     "linked_investment_transaction_id" TEXT;

-- CreateTable
CREATE TABLE "app"."account_balance_snapshots" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "as_of_date" DATE NOT NULL,
    "balance" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "method" "app"."BalanceCalculationMethod" NOT NULL,

    CONSTRAINT "account_balance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."transfer_match_candidates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "counterpart_type" "app"."TransferCounterpartType" NOT NULL,
    "counterpart_id" TEXT NOT NULL,
    "confidence_score" DECIMAL(4,3) NOT NULL,
    "status" "app"."TransferMatchStatus" NOT NULL DEFAULT 'pending',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "transfer_match_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."obligations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "frequency" "app"."ObligationFrequency" NOT NULL,
    "next_due_date" DATE NOT NULL,
    "priority" "app"."ObligationPriority" NOT NULL DEFAULT 'planned',
    "funded_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "account_id" TEXT,
    "category_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."income_streams" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "frequency" "app"."ObligationFrequency" NOT NULL,
    "gross_amount" DECIMAL(18,4) NOT NULL,
    "net_amount" DECIMAL(18,4),
    "next_expected_date" DATE NOT NULL,
    "end_date" DATE,
    "confidence" "app"."IncomeConfidence" NOT NULL DEFAULT 'estimated',
    "account_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "income_streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."cash_reserves" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "target_amount" DECIMAL(18,4) NOT NULL,
    "minimum_amount" DECIMAL(18,4),
    "account_id" TEXT,

    CONSTRAINT "cash_reserves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_balance_snapshots_user_id_as_of_date_idx" ON "app"."account_balance_snapshots"("user_id", "as_of_date");

-- CreateIndex
CREATE UNIQUE INDEX "account_balance_snapshots_account_id_as_of_date_key" ON "app"."account_balance_snapshots"("account_id", "as_of_date");

-- CreateIndex
CREATE INDEX "transfer_match_candidates_user_id_status_idx" ON "app"."transfer_match_candidates"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_match_candidates_transaction_id_counterpart_type_c_key" ON "app"."transfer_match_candidates"("transaction_id", "counterpart_type", "counterpart_id");

-- CreateIndex
CREATE INDEX "obligations_user_id_idx" ON "app"."obligations"("user_id");

-- CreateIndex
CREATE INDEX "income_streams_user_id_idx" ON "app"."income_streams"("user_id");

-- CreateIndex
CREATE INDEX "cash_reserves_user_id_idx" ON "app"."cash_reserves"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_linked_investment_transaction_id_key" ON "app"."transactions"("linked_investment_transaction_id");

-- AddForeignKey
ALTER TABLE "app"."account_balance_snapshots" ADD CONSTRAINT "account_balance_snapshots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."account_balance_snapshots" ADD CONSTRAINT "account_balance_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_linked_investment_transaction_id_fkey" FOREIGN KEY ("linked_investment_transaction_id") REFERENCES "app"."investment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."transfer_match_candidates" ADD CONSTRAINT "transfer_match_candidates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."transfer_match_candidates" ADD CONSTRAINT "transfer_match_candidates_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "app"."transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."obligations" ADD CONSTRAINT "obligations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."obligations" ADD CONSTRAINT "obligations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."obligations" ADD CONSTRAINT "obligations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."income_streams" ADD CONSTRAINT "income_streams_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."income_streams" ADD CONSTRAINT "income_streams_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."cash_reserves" ADD CONSTRAINT "cash_reserves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."cash_reserves" ADD CONSTRAINT "cash_reserves_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

