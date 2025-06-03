import Indexar from "./indexar";
import { ethers } from "ethers";

class IndexarManager {
  private indexar: Indexar | null;

  constructor() {
    this.indexar = null;
  }

  async initialize(config: {
    provider: ethers.JsonRpcProvider;
    dbPath: string;
    batchSize: number;
    startBlock: number;
  }) {
    this.indexar = new Indexar(config);

    // Set up event listeners
    this.indexar.on("started", () => {
      console.log("✅ Indexer started successfully");
    });

    this.indexar.on("stopped", () => {
      console.log("⏹️ Indexer stopped");
    });

    this.indexar.on("blockProcessed", (data: any) => {
      console.log(`📦 Block ${data.blockNumber} processed`);
    });

    this.indexar.on("eventIndexed", (data: any) => {
      console.log(`📝 Event indexed: ${data.event} from ${data.contract}`);
    });

    this.indexar.on("progress", (data: any) => {
      console.log(
        `⏳ Progress: ${data.percentage.toFixed(2)}% (${data.processed}/${
          data.total
        })`
      );
    });

    return this.indexar;
  }

  async addBatchContracts(
    contracts: {
      address: string;
      name: string;
      abi: ethers.InterfaceAbi;
    }[]
  ) {
    for (const contract of contracts) {
      this.indexar?.addContract(contract.address, contract.name, contract.abi);
    }
    console.log(`Added ${contracts.length} contracts`);
  }
}

export default IndexarManager;
