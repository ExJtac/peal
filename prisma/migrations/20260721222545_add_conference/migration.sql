-- AlterEnum
ALTER TYPE "DestinationType" ADD VALUE 'CONFERENCE';

-- CreateTable
CREATE TABLE "Conference" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mohWhenAlone" BOOLEAN NOT NULL DEFAULT true,
    "record" BOOLEAN NOT NULL DEFAULT false,
    "maxMembers" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conference_number_key" ON "Conference"("number");
