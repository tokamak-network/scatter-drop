import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const prisma = new PrismaClient();
const OWNER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"; // anvil #0 (dev owner)

// Read the current fork deployment (dev-fork.sh writes this) so re-seeding after
// a redeploy refreshes the factory/token addresses in the registry.
const here = dirname(fileURLToPath(import.meta.url));
const CHAIN_ID = Number(process.env.FORK_CHAIN_ID) || 31337; // matches dev-fork.sh's default/override
let dep = {};
try {
  dep = JSON.parse(readFileSync(join(here, `../../../contracts/deployments/${CHAIN_ID}.json`), "utf8"));
} catch {
  console.warn(`no contracts/deployments/${CHAIN_ID}.json — run scripts/dev-fork.sh first`);
}

const net = {
  name: "Local Fork",
  rpcUrl: "http://127.0.0.1:8545",
  publicRpcUrl: "http://127.0.0.1:8545",
  nativeSymbol: "ETH",
  dropFactory: dep.dropFactory ?? "0x0000000000000000000000000000000000000000",
  feeToken: dep.feeToken ?? null,
  treasury: dep.treasury ?? null,
  operatorRegistry: dep.operatorRegistry ?? null,
  zkFactory: dep.zkFactory ?? null,
  enabled: true,
};

await prisma.platformAdmin.upsert({
  where: { address: OWNER }, update: {},
  create: { address: OWNER, label: "anvil #0 (dev owner)" },
});
await prisma.network.upsert({
  where: { chainId: CHAIN_ID },
  update: net, // refresh addresses on redeploy
  create: { chainId: CHAIN_ID, ...net },
});
console.log(`seeded: admin + network ${CHAIN_ID} → factory`, net.dropFactory);
await prisma.$disconnect();
