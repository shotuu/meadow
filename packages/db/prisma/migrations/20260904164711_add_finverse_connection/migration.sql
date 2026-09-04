-- AlterEnum
ALTER TYPE "app"."SyncSource" ADD VALUE 'finverse';

-- CreateTable
CREATE TABLE "app"."finverse_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "login_identity_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "institution_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "finverse_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finverse_connections_login_identity_id_key" ON "app"."finverse_connections"("login_identity_id");

-- CreateIndex
CREATE INDEX "finverse_connections_user_id_idx" ON "app"."finverse_connections"("user_id");

-- AddForeignKey
ALTER TABLE "app"."finverse_connections" ADD CONSTRAINT "finverse_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
