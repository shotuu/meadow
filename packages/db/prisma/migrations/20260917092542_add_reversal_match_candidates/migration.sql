-- CreateEnum
CREATE TYPE "app"."ReversalMatchStatus" AS ENUM ('pending', 'confirmed', 'dismissed');

-- CreateTable
CREATE TABLE "app"."reversal_match_candidates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "charge_transaction_id" TEXT NOT NULL,
    "reversal_transaction_id" TEXT NOT NULL,
    "confidence_score" DECIMAL(4,3) NOT NULL,
    "days_apart" INTEGER NOT NULL,
    "status" "app"."ReversalMatchStatus" NOT NULL DEFAULT 'pending',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "reversal_match_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reversal_match_candidates_user_id_status_idx" ON "app"."reversal_match_candidates"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reversal_match_candidates_charge_transaction_id_reversal_tr_key" ON "app"."reversal_match_candidates"("charge_transaction_id", "reversal_transaction_id");

-- AddForeignKey
ALTER TABLE "app"."reversal_match_candidates" ADD CONSTRAINT "reversal_match_candidates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."reversal_match_candidates" ADD CONSTRAINT "reversal_match_candidates_charge_transaction_id_fkey" FOREIGN KEY ("charge_transaction_id") REFERENCES "app"."transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."reversal_match_candidates" ADD CONSTRAINT "reversal_match_candidates_reversal_transaction_id_fkey" FOREIGN KEY ("reversal_transaction_id") REFERENCES "app"."transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
