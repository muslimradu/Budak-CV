-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "emailLanguage" TEXT NOT NULL DEFAULT 'auto';
