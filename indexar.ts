import { EventEmitter } from "events";
import { ethers } from "ethers";
import sqlite3 from "sqlite3";
import type { AbiItem } from "viem";
import type { AbiConstructor } from "abitype";

class Indexar extends EventEmitter {
  provider: ethers.JsonRpcProvider;
  db: sqlite3.Database;
  contracts: Map<
    string,
    { name: string; abi: ethers.InterfaceAbi; contract: ethers.Contract }
  >;
  lastProcessedBlock: number;
  batchSize: number;
  isRunning: boolean;

  constructor(config: {
    provider: ethers.JsonRpcProvider;
    dbPath: string;
    batchSize: number;
  }) {
    super();
    this.provider = config.provider;
    this.db = new sqlite3.Database(config.dbPath || "indexar.db");
    this.contracts = new Map();
    this.batchSize = config.batchSize;
    this.lastProcessedBlock = 0;
    this.isRunning = false;
  }

  initializeDb() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS blocks (
        number INTEGER PRIMARY KEY,
        hash TEXT UNIQUE,
        timestamp INTEGER,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS contracts (
        address TEXT PRIMARY KEY,
        name TEXT,
        abi TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_address TEXT,
        event_name TEXT,
        block_number INTEGER,
        transaction_hash TEXT,
        log_index INTEGER,
        args TEXT,
        timestamp INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contract_address) REFERENCES contracts (address)
      )`,
      `CREATE TABLE IF NOT EXISTS transactions (
        hash TEXT PRIMARY KEY,
        block_number INTEGER,
        from_address TEXT,
        to_address TEXT,
        value TEXT,
        gas_used INTEGER,
        gas_price TEXT,
        timestamp INTEGER,
        status INTEGER
      )`,
    ];

    tables.forEach((sql) => {
      this.db.run(sql, (err) => {
        if (err) console.error("Database initialization error:", err);
      });
    });

    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_events_contract ON events(contract_address)",
      "CREATE INDEX IF NOT EXISTS idx_events_block ON events(block_number)",
      "CREATE INDEX IF NOT EXISTS idx_events_name ON events(event_name)",
      "CREATE INDEX IF NOT EXISTS idx_transactions_block ON transactions(block_number)",
    ];

    indexes.forEach((sql) => {
      this.db.run(sql);
    });
  }

  addContract(address: string, name: string, abi: ethers.InterfaceAbi) {
    try {
      const contract = new ethers.Contract(address, abi, this.provider);
      this.contracts.set(address, {
        name,
        abi,
        contract,
      });

      this.db.run(
        "INSERT INTO contracts (address, name, abi) VALUES (?, ?, ?)",
        [address, name, JSON.stringify(abi)],
        (err) => {
          if (err) console.error("Error adding contract:", err);
        }
      );
      console.log(`Contract ${name} added successfully`);
    } catch (error) {
      console.error("Error adding contract:", error);
    }
  }

  async start() {
    if (this.isRunning) {
      console.log("Indexar is already running");
      return;
    }

    this.isRunning = true;
    console.log("Indexar starting...");

    try {
      const currentBlock = await this.provider.getBlockNumber();
      console.log(`Current block: ${currentBlock}`);
      console.log(`last processed block: ${this.lastProcessedBlock}`);

      if (this.lastProcessedBlock < currentBlock) {
        // process blocks
        await this.processHistoricalBlocks(
          this.lastProcessedBlock,
          currentBlock
        );
      }

      this.provider.on("block", async (blockNumber) => {
        if (this.isRunning) {
          await this.processBlock(blockNumber);
        }
      });

      this.emit("started");
    } catch (error) {
      console.error("Error starting Indexar:", error);
      this.isRunning = false;
    }
  }

  async processHistoricalBlocks(fromBlock: number, toBlock: number) {
    console.log(`Processing blocks from ${fromBlock} to ${toBlock}`);

    for (
      let blockNumber = fromBlock;
      blockNumber <= toBlock;
      blockNumber += this.batchSize
    ) {
      if (!this.isRunning) {
        console.log("Indexar is not running, stopping processing");
        break;
      }

      const end = Math.min(blockNumber + this.batchSize - 1, toBlock);
      console.log(`Processing blocks ${blockNumber} to ${end}`);

      try {
        await this.processBatchBlocks(blockNumber, end);
        this.lastProcessedBlock = end;

        this.emit("progress", {
          processed: end,
          total: toBlock,
          percentage: ((end - fromBlock) / (toBlock - fromBlock)) * 100,
        });

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error("Error processing blocks:", error);
      }
    }
  }

  async processBatchBlocks(fromBlock: number, toBlock: number) {
    console.log(`Processing blocks ${fromBlock} to ${toBlock}`);
    const promises = [];

    for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber++) {
      promises.push(this.processBlock(blockNumber));
    }

    await Promise.all(promises);
  }

  async processBlock(blockNumber: number) {
    console.log(`Processing block ${blockNumber}`);
  }
}

export default Indexar;
