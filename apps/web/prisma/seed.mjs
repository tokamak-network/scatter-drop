import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const OWNER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"; // anvil #0 (dev DropFactory owner)
await prisma.platformAdmin.upsert({
  where: { address: OWNER }, update: {},
  create: { address: OWNER, label: "anvil #0 (dev owner)" },
});
await prisma.network.upsert({
  where: { chainId: 31337 }, update: {},
  create: {
    chainId: 31337, name: "Local Fork",
    rpcUrl: "http://127.0.0.1:8545", publicRpcUrl: "http://127.0.0.1:8545",
    nativeSymbol: "ETH",
    dropFactory: "0x71E8CDe3479b19F772B9156528b1172559ff7D2B",
    feeToken: "0x3AEcD130527D203F58C338B1b2dC89da2447bA9a",
    enabled: true,
  },
});
console.log("seeded: 1 admin + 1 network (31337)");
await prisma.$disconnect();
