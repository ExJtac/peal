import "dotenv/config";
import { reconcileAll } from "@/telephony/realtime/reconcile";

// Rebuild all Asterisk realtime ps_* rows from Prisma truth (extensions + trunks). Run after
// seeding / bulk changes, or from the admin "reconcile-all" action. Requires the "asterisk"
// schema to exist (npm run db:asterisk).
async function main() {
  const hash = await reconcileAll();
  console.log(`Reconciled ps_* from Prisma. reconcile hash: ${hash}`);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
