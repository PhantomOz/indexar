import { ethers } from "ethers";
import IndexarManager from "./src/services/IndexarManager";
import LendBitAbi from "./abis/LendBit.json";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const config = {
    provider: new ethers.JsonRpcProvider(process.env.RPC_URL),
    dbPath: "./indexar.db",
    batchSize: 50,
    startBlock: 25698916,
  };

  const indexarManager = new IndexarManager();
  const indexar = await indexarManager.initialize(config);

  const contracts = [
    {
      address: "0x820507043F0abdC50C629B09cbC61323967331e3",
      name: "LendBit",
      abi: LendBitAbi,
    },
  ];

  await indexarManager.addBatchContracts(contracts);

  await indexar.start();
}

main();
