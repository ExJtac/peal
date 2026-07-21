// Hermetic test environment. The offline suite must never use real API keys or a real
// Asterisk/STT engine (avoids cost + non-determinism), regardless of the developer's .env.
// Runs before each test file's imports; dotenv (if imported) does not override values
// already present in process.env, so these win.
process.env.ANTHROPIC_API_KEY = "";
process.env.DEEPGRAM_API_KEY = "";
process.env.STT_PROVIDER = "mock";
process.env.ALLOW_MOCK = "1";
process.env.CRED_SECRET = process.env.CRED_SECRET || "test-only-cred-secret";
process.env.PROVISION_SECRET = process.env.PROVISION_SECRET || "test-only-provision-secret";
