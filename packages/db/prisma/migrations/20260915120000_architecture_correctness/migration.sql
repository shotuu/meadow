-- DropIndex
DROP INDEX "app"."recurring_series_user_id_merchant_key_key";

-- AlterTable
ALTER TABLE "app"."accounts" ADD COLUMN     "balance_is_canonical" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "app"."account_balance_snapshots" ADD COLUMN     "is_complete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "source_as_of" TIMESTAMP(3),
ADD COLUMN     "valuation_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "app"."transactions" ADD COLUMN     "categorization_attempted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "app"."recurring_series" ADD COLUMN     "group_key" TEXT;

-- CreateTable
CREATE TABLE "app"."oauth_link_attempts" (
    "state_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_link_attempts_pkey" PRIMARY KEY ("state_hash")
);

-- CreateTable
CREATE TABLE "app"."job_runs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oauth_link_attempts_expires_at_idx" ON "app"."oauth_link_attempts"("expires_at");

-- CreateIndex
CREATE INDEX "job_runs_name_started_at_idx" ON "app"."job_runs"("name", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_series_user_id_group_key_key" ON "app"."recurring_series"("user_id", "group_key");

