-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "TrunkProvider" AS ENUM ('TELNYX', 'TWILIO', 'BANDWIDTH', 'VOIPMS', 'GENERIC');

-- CreateEnum
CREATE TYPE "TrunkAuthMode" AS ENUM ('REGISTER', 'IP_AUTH');

-- CreateEnum
CREATE TYPE "SipTransport" AS ENUM ('UDP', 'TCP', 'TLS');

-- CreateEnum
CREATE TYPE "DestinationType" AS ENUM ('EXTENSION', 'RING_GROUP', 'IVR', 'VOICEMAIL', 'TIME_CONDITION', 'HANGUP', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "RingStrategy" AS ENUM ('RINGALL', 'HUNT', 'MEMORY_HUNT', 'RANDOM');

-- CreateEnum
CREATE TYPE "IvrNodeType" AS ENUM ('MENU', 'PLAY', 'COLLECT', 'TRANSFER', 'VOICEMAIL', 'DIRECTORY', 'HANGUP');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CallDisposition" AS ENUM ('ANSWERED', 'NO_ANSWER', 'BUSY', 'FAILED', 'VOICEMAIL', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DeviceVendor" AS ENUM ('FANVIL', 'YEALINK', 'GRANDSTREAM', 'POLY', 'GENERIC');

-- CreateEnum
CREATE TYPE "GuardrailAction" AS ENUM ('ALLOW', 'BLOCK', 'PIN_REQUIRED');

-- CreateEnum
CREATE TYPE "CallClass" AS ENUM ('INTERNAL', 'LOCAL', 'NATIONAL', 'INTERNATIONAL', 'TOLLFREE', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "AiJobKind" AS ENUM ('TRANSCRIBE_VOICEMAIL', 'SUMMARIZE_CALL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "VmFolder" AS ENUM ('INBOX', 'OLD');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "extensionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extension" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sipPasswordEnc" TEXT NOT NULL,
    "email" TEXT,
    "callerIdName" TEXT,
    "callerIdNumber" TEXT,
    "codecs" TEXT[] DEFAULT ARRAY['ulaw', 'alaw']::TEXT[],
    "maxContacts" INTEGER NOT NULL DEFAULT 1,
    "ringSeconds" INTEGER NOT NULL DEFAULT 20,
    "dnd" BOOLEAN NOT NULL DEFAULT false,
    "callForward" JSONB,
    "outboundPermission" TEXT NOT NULL DEFAULT 'local',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Extension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "vendor" "DeviceVendor" NOT NULL DEFAULT 'FANVIL',
    "model" TEXT NOT NULL,
    "extensionId" TEXT,
    "lineKeys" JSONB,
    "provisioningTokenEnc" TEXT NOT NULL,
    "firmwareTarget" TEXT,
    "timezone" TEXT,
    "e911LocationId" TEXT,
    "lastProvisionedAt" TIMESTAMP(3),
    "lastProvisionedIp" TEXT,
    "lastUserAgent" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoicemailBox" (
    "id" TEXT NOT NULL,
    "mailbox" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "pinEnc" TEXT,
    "email" TEXT,
    "attachAudio" BOOLEAN NOT NULL DEFAULT true,
    "greetingPath" TEXT,
    "transcribeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoicemailBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoicemailMessage" (
    "id" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "asteriskMsgId" TEXT,
    "folder" "VmFolder" NOT NULL DEFAULT 'INBOX',
    "fromNumber" TEXT,
    "fromName" TEXT,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "audioPath" TEXT NOT NULL,
    "aiSummary" TEXT,
    "urgency" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoicemailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "segments" JSONB,
    "engine" TEXT NOT NULL DEFAULT 'mock',
    "callRecordId" TEXT,
    "voicemailMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trunk" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "TrunkProvider" NOT NULL DEFAULT 'TELNYX',
    "authMode" "TrunkAuthMode" NOT NULL DEFAULT 'IP_AUTH',
    "sipServer" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 5060,
    "transport" "SipTransport" NOT NULL DEFAULT 'UDP',
    "username" TEXT,
    "passwordEnc" TEXT,
    "fromDomain" TEXT,
    "fromUser" TEXT,
    "authIps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outboundProxy" TEXT,
    "codecs" TEXT[] DEFAULT ARRAY['ulaw', 'alaw']::TEXT[],
    "registerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxChannels" INTEGER NOT NULL DEFAULT 10,
    "spendCeilingUsd" DECIMAL(10,2),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Did" (
    "id" TEXT NOT NULL,
    "e164" TEXT NOT NULL,
    "description" TEXT,
    "trunkId" TEXT,
    "inboundRouteId" TEXT,
    "emergencyCapable" BOOLEAN NOT NULL DEFAULT false,
    "e911LocationId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Did_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundRoute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destinationType" "DestinationType" NOT NULL,
    "destinationId" TEXT,
    "businessHoursId" TEXT,
    "cidNamePrefix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundRoute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "matchPattern" TEXT NOT NULL,
    "stripDigits" INTEGER NOT NULL DEFAULT 0,
    "prependDigits" TEXT NOT NULL DEFAULT '',
    "trunkId" TEXT NOT NULL,
    "failoverTrunkId" TEXT,
    "callerIdNumber" TEXT,
    "permissionTag" TEXT NOT NULL DEFAULT 'local',
    "requiresPin" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RingGroup" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategy" "RingStrategy" NOT NULL DEFAULT 'RINGALL',
    "ringSeconds" INTEGER NOT NULL DEFAULT 20,
    "failoverType" "DestinationType",
    "failoverId" TEXT,
    "cidNamePrefix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RingGroupMember" (
    "id" TEXT NOT NULL,
    "ringGroupId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RingGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IvrFlow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT,
    "entryNodeId" TEXT,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 5,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "invalidType" "DestinationType",
    "invalidId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IvrFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IvrNode" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "type" "IvrNodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "promptPath" TEXT,
    "promptText" TEXT,
    "timeoutNodeId" TEXT,
    "invalidNodeId" TEXT,
    "destinationType" "DestinationType",
    "destinationId" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IvrNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IvrOption" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "digit" TEXT NOT NULL,
    "nextNodeId" TEXT,
    "destinationType" "DestinationType",
    "destinationId" TEXT,

    CONSTRAINT "IvrOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessHours" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "rules" JSONB NOT NULL,
    "holidays" JSONB,
    "inType" "DestinationType" NOT NULL,
    "inId" TEXT,
    "elseType" "DestinationType" NOT NULL,
    "elseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallRecord" (
    "id" TEXT NOT NULL,
    "uniqueId" TEXT,
    "linkedId" TEXT,
    "direction" "CallDirection" NOT NULL,
    "fromNumber" TEXT,
    "toNumber" TEXT,
    "fromExtensionId" TEXT,
    "toExtensionId" TEXT,
    "didId" TEXT,
    "trunkId" TEXT,
    "callClass" "CallClass",
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "billSec" INTEGER NOT NULL DEFAULT 0,
    "disposition" "CallDisposition",
    "hangupCause" TEXT,
    "recordingPath" TEXT,
    "aiSummary" TEXT,
    "aiActionItems" JSONB,
    "aiSentiment" TEXT,
    "guardrailAction" "GuardrailAction",
    "guardrailReason" TEXT,

    CONSTRAINT "CallRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "E911Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "suite" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postal" TEXT NOT NULL,
    "callbackNumber" TEXT NOT NULL,
    "notifyEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifyExtensionId" TEXT,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validatedAt" TIMESTAMP(3),
    "validationRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "E911Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardrailPolicy" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "internationalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "internationalPinEnc" TEXT,
    "maxConcurrentOutbound" INTEGER NOT NULL DEFAULT 4,
    "perDestinationVelocity" JSONB,
    "allowedCountryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockedPrefixes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "perTrunkSpendCeilingUsd" DECIMAL(10,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardrailPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendCounter" (
    "id" TEXT NOT NULL,
    "trunkId" TEXT,
    "scope" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "amountUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "callCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SpendCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VelocityCounter" (
    "id" TEXT NOT NULL,
    "destinationPrefix" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VelocityCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockEvent" (
    "id" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL DEFAULT 'OUTBOUND',
    "fromExtensionId" TEXT,
    "toNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "action" "GuardrailAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "companyName" TEXT NOT NULL DEFAULT 'My Company',
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "defaultCallerId" TEXT,
    "sipDomain" TEXT NOT NULL DEFAULT 'pbx.local',
    "externalIp" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemStatus" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "ariConnected" BOOLEAN NOT NULL DEFAULT false,
    "asteriskReachable" BOOLEAN NOT NULL DEFAULT false,
    "activeChannels" INTEGER NOT NULL DEFAULT 0,
    "lastEventAt" TIMESTAMP(3),
    "lastReconnectAt" TIMESTAMP(3),
    "psReconcileHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL,
    "kind" "AiJobKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_extensionId_key" ON "User"("extensionId");

-- CreateIndex
CREATE UNIQUE INDEX "Extension_number_key" ON "Extension"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Device_mac_key" ON "Device"("mac");

-- CreateIndex
CREATE UNIQUE INDEX "VoicemailBox_mailbox_key" ON "VoicemailBox"("mailbox");

-- CreateIndex
CREATE UNIQUE INDEX "VoicemailBox_extensionId_key" ON "VoicemailBox"("extensionId");

-- CreateIndex
CREATE INDEX "VoicemailMessage_boxId_folder_receivedAt_idx" ON "VoicemailMessage"("boxId", "folder", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_callRecordId_key" ON "Transcript"("callRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_voicemailMessageId_key" ON "Transcript"("voicemailMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Trunk_name_key" ON "Trunk"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Did_e164_key" ON "Did"("e164");

-- CreateIndex
CREATE INDEX "OutboundRoute_priority_idx" ON "OutboundRoute"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "RingGroup_number_key" ON "RingGroup"("number");

-- CreateIndex
CREATE UNIQUE INDEX "RingGroupMember_ringGroupId_extensionId_key" ON "RingGroupMember"("ringGroupId", "extensionId");

-- CreateIndex
CREATE UNIQUE INDEX "IvrFlow_number_key" ON "IvrFlow"("number");

-- CreateIndex
CREATE INDEX "IvrNode_flowId_idx" ON "IvrNode"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "IvrOption_nodeId_digit_key" ON "IvrOption"("nodeId", "digit");

-- CreateIndex
CREATE UNIQUE INDEX "CallRecord_uniqueId_key" ON "CallRecord"("uniqueId");

-- CreateIndex
CREATE INDEX "CallRecord_direction_startedAt_idx" ON "CallRecord"("direction", "startedAt");

-- CreateIndex
CREATE INDEX "CallRecord_linkedId_idx" ON "CallRecord"("linkedId");

-- CreateIndex
CREATE UNIQUE INDEX "SpendCounter_scope_windowStart_key" ON "SpendCounter"("scope", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "VelocityCounter_destinationPrefix_windowStart_key" ON "VelocityCounter"("destinationPrefix", "windowStart");

-- CreateIndex
CREATE INDEX "BlockEvent_createdAt_idx" ON "BlockEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiJob_status_createdAt_idx" ON "AiJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoicemailBox" ADD CONSTRAINT "VoicemailBox_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoicemailMessage" ADD CONSTRAINT "VoicemailMessage_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "VoicemailBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_callRecordId_fkey" FOREIGN KEY ("callRecordId") REFERENCES "CallRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_voicemailMessageId_fkey" FOREIGN KEY ("voicemailMessageId") REFERENCES "VoicemailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Did" ADD CONSTRAINT "Did_trunkId_fkey" FOREIGN KEY ("trunkId") REFERENCES "Trunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Did" ADD CONSTRAINT "Did_inboundRouteId_fkey" FOREIGN KEY ("inboundRouteId") REFERENCES "InboundRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Did" ADD CONSTRAINT "Did_e911LocationId_fkey" FOREIGN KEY ("e911LocationId") REFERENCES "E911Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundRoute" ADD CONSTRAINT "InboundRoute_businessHoursId_fkey" FOREIGN KEY ("businessHoursId") REFERENCES "BusinessHours"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RingGroupMember" ADD CONSTRAINT "RingGroupMember_ringGroupId_fkey" FOREIGN KEY ("ringGroupId") REFERENCES "RingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RingGroupMember" ADD CONSTRAINT "RingGroupMember_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IvrNode" ADD CONSTRAINT "IvrNode_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "IvrFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IvrOption" ADD CONSTRAINT "IvrOption_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "IvrNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
