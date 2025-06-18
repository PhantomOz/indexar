import { ethers } from "ethers";
import IndexarManager from "./src/services/IndexarManager";
import CombinedAbi from "./abis/combined_facet_events.json";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  // Initialize Indexar
  const config_hub = {
    provider: new ethers.JsonRpcProvider(process.env.RPC_URL),
    dbPath: "./indexar.db",
    batchSize: 50,
    startBlock: await new ethers.JsonRpcProvider(
      process.env.RPC_URL
    ).getBlockNumber(),
  };

  const indexarManager = new IndexarManager();
  const indexar = await indexarManager.initialize(config_hub);

  const contracts = [
    {
      address: "0x820507043F0abdC50C629B09cbC61323967331e3",
      name: "LendBit",
      abi: CombinedAbi.events,
    },
    {
      address: "0x052C88f4f88c9330f6226cdC120ba173416134C3",
      name: "LendBitV1",
      abi: CombinedAbi.events,
    },
  ];

  await indexarManager.addBatchContracts(contracts);

  // Optionally remove contracts if needed
  await indexarManager.removeBatchContracts([
    "0x820507043F0abdC50C629B09cbC61323967331e3",
    "0x052C88f4f88c9330f6226cdC120ba173416134C3",
  ]);

  await indexarManager.addBatchContracts(contracts);

  // Start the indexer
  indexar.start().catch((error) => {
    console.error("Indexer error:", error);
  });
}

main().catch((error) => {
  console.error("Error starting indexer worker:", error);
  process.exit(1);
});
