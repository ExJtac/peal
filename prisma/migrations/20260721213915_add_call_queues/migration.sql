-- CreateEnum
CREATE TYPE "QueueStrategy" AS ENUM ('RINGALL', 'LINEAR', 'FEWEST_CALLS', 'LEAST_RECENT', 'RANDOM');

-- CreateEnum
CREATE TYPE "QueueCallOutcome" AS ENUM ('ANSWERED', 'ABANDONED', 'TIMEOUT', 'FAILOVER');

-- AlterEnum
ALTER TYPE "DestinationType" ADD VALUE 'QUEUE';

-- CreateTable
CREATE TABLE "Queue" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategy" "QueueStrategy" NOT NULL DEFAULT 'RINGALL',
    "mohClass" TEXT NOT NULL DEFAULT 'default',
    "joinEmpty" BOOLEAN NOT NULL DEFAULT true,
    "leaveWhenEmpty" BOOLEAN NOT NULL DEFAULT false,
    "agentRingSeconds" INTEGER NOT NULL DEFAULT 20,
    "wrapUpSeconds" INTEGER NOT NULL DEFAULT 0,
    "maxWaitSeconds" INTEGER NOT NULL DEFAULT 0,
    "announcePosition" BOOLEAN NOT NULL DEFAULT true,
    "announceHoldTime" BOOLEAN NOT NULL DEFAULT false,
    "announceFrequency" INTEGER NOT NULL DEFAULT 30,
    "timeoutType" "DestinationType",
    "timeoutId" TEXT,
    "failoverType" "DestinationType",
    "failoverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueMember" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "penalty" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "loggedIn" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "QueueMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueCallLog" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "callRecordId" TEXT,
    "callerNumber" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "waitSec" INTEGER NOT NULL DEFAULT 0,
    "talkSec" INTEGER NOT NULL DEFAULT 0,
    "agentExtensionId" TEXT,
    "position" INTEGER,
    "outcome" "QueueCallOutcome",

    CONSTRAINT "QueueCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueStatus" (
    "queueId" TEXT NOT NULL,
    "waiting" INTEGER NOT NULL DEFAULT 0,
    "longestWaitSec" INTEGER NOT NULL DEFAULT 0,
    "agentsAvailable" INTEGER NOT NULL DEFAULT 0,
    "agentsOnCall" INTEGER NOT NULL DEFAULT 0,
    "agentsPaused" INTEGER NOT NULL DEFAULT 0,
    "answeredToday" INTEGER NOT NULL DEFAULT 0,
    "abandonedToday" INTEGER NOT NULL DEFAULT 0,
    "avgWaitSec" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueStatus_pkey" PRIMARY KEY ("queueId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Queue_number_key" ON "Queue"("number");

-- CreateIndex
CREATE UNIQUE INDEX "QueueMember_queueId_extensionId_key" ON "QueueMember"("queueId", "extensionId");

-- CreateIndex
CREATE INDEX "QueueCallLog_queueId_enteredAt_idx" ON "QueueCallLog"("queueId", "enteredAt");

-- AddForeignKey
ALTER TABLE "QueueMember" ADD CONSTRAINT "QueueMember_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueMember" ADD CONSTRAINT "QueueMember_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueCallLog" ADD CONSTRAINT "QueueCallLog_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
