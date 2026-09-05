-- AlterEnum
ALTER TYPE "app"."BudgetType" ADD VALUE 'prepaid_coverage';

-- CreateTable
CREATE TABLE "app"."prepaid_coverages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "coverage_months" INTEGER NOT NULL,

    CONSTRAINT "prepaid_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prepaid_coverages_category_id_key" ON "app"."prepaid_coverages"("category_id");

-- AddForeignKey
ALTER TABLE "app"."prepaid_coverages" ADD CONSTRAINT "prepaid_coverages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."prepaid_coverages" ADD CONSTRAINT "prepaid_coverages_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
