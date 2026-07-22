-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "provisioningPollHours" INTEGER NOT NULL DEFAULT 24;

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "webAdminPasswordEnc" TEXT,
ADD COLUMN     "webAdminUser" TEXT NOT NULL DEFAULT 'admin';
