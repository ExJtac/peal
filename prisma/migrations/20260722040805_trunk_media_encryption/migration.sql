-- CreateEnum
CREATE TYPE "MediaEncryption" AS ENUM ('NONE', 'SDES', 'DTLS');

-- AlterTable
ALTER TABLE "Trunk" ADD COLUMN     "mediaEncryption" "MediaEncryption" NOT NULL DEFAULT 'NONE';
