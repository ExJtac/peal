-- CreateEnum
CREATE TYPE "AiOutcome" AS ENUM ('HANDLED', 'TRANSFERRED', 'VOICEMAIL', 'HANGUP', 'FALLBACK', 'ERROR');

-- AlterEnum
ALTER TYPE "DestinationType" ADD VALUE 'AI_AGENT';

-- AlterTable
ALTER TABLE "CallRecord" ADD COLUMN     "aiAgentId" TEXT,
ADD COLUMN     "aiOutcome" "AiOutcome";

-- CreateTable
CREATE TABLE "AiAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "greeting" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL DEFAULT 'You are a friendly, concise phone receptionist.',
    "businessContext" TEXT,
    "voice" TEXT,
    "llmModel" TEXT,
    "maxTurns" INTEGER NOT NULL DEFAULT 12,
    "endpointingMs" INTEGER NOT NULL DEFAULT 800,
    "bargeIn" BOOLEAN NOT NULL DEFAULT true,
    "noInputTimeoutMs" INTEGER NOT NULL DEFAULT 7000,
    "maxReprompts" INTEGER NOT NULL DEFAULT 2,
    "allowTransfer" BOOLEAN NOT NULL DEFAULT true,
    "transferType" "DestinationType",
    "transferId" TEXT,
    "allowVoicemail" BOOLEAN NOT NULL DEFAULT true,
    "voicemailExtId" TEXT,
    "fallbackType" "DestinationType",
    "fallbackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgent_pkey" PRIMARY KEY ("id")
);
