-- AlterTable
ALTER TABLE "app"."accounts" ADD COLUMN     "balance_as_of" TIMESTAMP(3),
ADD COLUMN     "current_balance" DECIMAL(18,4);
