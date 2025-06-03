import { EventEmitter } from "events";
import { ethers } from "ethers";
import sqlite3 from "sqlite3";

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

  async stop() {
    this.isRunning = false;
    this.provider.removeAllListeners("block");
    console.log("Indexar stopped");
    this.emit("stopped");
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

  async processBlock(blockNumber: number, isRealTime: boolean = true) {
    console.log(`Processing block ${blockNumber}`);
    try {
      const block = await this.provider.getBlock(blockNumber);
      if (!block) {
        console.log(`Block ${blockNumber} not found, skipping`);
        return;
      }

      this.db.run(
        "INSERT INTO blocks (number, hash, timestamp) VALUES (?, ?, ?)",
        [block.number, block.hash, block.timestamp],
        (err) => {
          if (err) console.error("Error inserting block:", err);
        }
      );

      for (const tx of block.transactions) {
        // process transaction
        await this.processTransaction(tx, block.timestamp);
      }

      // process events
      await this.processBlockEvents(blockNumber);

      if (isRealTime) {
        this.lastProcessedBlock = blockNumber;
        this.emit("blockProcessed", {
          blockNumber,
          timestamp: block.timestamp,
        });
      }
    } catch (error) {
      console.error("Error processing block:", error);
    }
  }

  async processTransaction(tx: string, timestamp: number) {
    try {
      const txResponse = await this.provider.getTransaction(tx);
      const txReceipt = await this.provider.getTransactionReceipt(tx);

      if (!txResponse) {
        console.log(`Transaction ${tx} not found, skipping`);
        return;
      }

      if (!txReceipt) {
        console.log(`Transaction receipt ${tx} not found, skipping`);
        return;
      }

      this.db.run(
        "INSERT INTO transactions (hash, block_number, from_address, to_address, value, gas_used, gas_price, timestamp, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          tx,
          txResponse.blockNumber,
          txResponse.from,
          txResponse.to,
          txResponse.value,
          txReceipt.gasUsed,
          txReceipt.gasPrice,
          timestamp,
          txReceipt.status,
        ],
        (err) => {
          if (err) console.error("Error inserting transaction:", err);
        }
      );
    } catch (error) {
      console.error("Error processing transaction:", error);
    }
  }

  async processBlockEvents(blockNumber: number) {
    for (const [address, contractInfo] of this.contracts) {
      try {
        const filter = {
          address: address,
          fromBlock: blockNumber,
          toBlock: blockNumber,
        };

        const logs = await this.provider.getLogs(filter);

        for (const log of logs) {
          await this.processEvent(log, contractInfo);
        }
      } catch (error) {
        console.error(
          `Error processing events for contract ${address}:`,
          error
        );
      }
    }
  }

  async processEvent(
    log: ethers.Log,
    contractInfo: {
      name: string;
      abi: ethers.InterfaceAbi;
      contract: ethers.Contract;
    }
  ) {
    try {
      const parsedLog = contractInfo.contract.interface.parseLog(log);
      if (!parsedLog) return;

      const args: Record<string, any> = {};
      parsedLog.args.forEach((arg, index) => {
        const param = parsedLog.fragment.inputs[index];
        args[param?.name ?? `arg${index}`] = this.serializeValue(arg);
      });

      // Get block timestamp
      const block = await this.provider.getBlock(log.blockNumber);

      this.db.run(
        `
        INSERT INTO events 
        (contract_address, event_name, block_number, transaction_hash, log_index, args, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        [
          log.address.toLowerCase(),
          parsedLog.name,
          log.blockNumber,
          log.transactionHash,
          log.index,
          JSON.stringify(args),
          block?.timestamp,
        ]
      );

      this.emit("eventIndexed", {
        contract: log.address,
        event: parsedLog.name,
        args,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      });
    } catch (error) {
      console.error("Error processing event:", error);
    }
  }

  serializeValue(value: any): any {
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (ethers.isAddress(value)) {
      return value.toLowerCase();
    }
    if (Array.isArray(value)) {
      return value.map((v: any) => this.serializeValue(v));
    }
    return value;
  }

  // Querying Methods

  async getEvents(query: {
    contractAddress?: string;
    eventName?: string;
    fromBlock?: number;
    toBlock?: number;
    limit?: number;
  }) {
    const {
      contractAddress,
      eventName,
      fromBlock,
      toBlock,
      limit = 100,
    } = query;
    let sql = "SELECT * FROM events WHERE 1=1";
    const params: any[] = [];

    if (contractAddress) {
      sql += " AND contract_address = ?";
      params.push(contractAddress);
    }

    if (eventName) {
      sql += " AND event_name = ?";
      params.push(eventName);
    }

    if (fromBlock) {
      sql += " AND block_number >= ?";
      params.push(fromBlock);
    }

    if (toBlock) {
      sql += " AND block_number <= ?";
      params.push(toBlock);
    }

    sql += " ORDER BY block_number DESC, log_index DESC LIMIT ?";
    params.push(limit);

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else
          resolve(
            rows.map((row: any) => ({
              ...row,
              args: JSON.parse(row.args),
            }))
          );
      });
    });
  }

  async getTransactions(query: {
    fromBlock?: number;
    toBlock?: number;
    address?: string;
    limit?: number;
  }) {
    const { fromBlock, toBlock, address, limit = 100 } = query;
    let sql = "SELECT * FROM transactions WHERE 1=1";
    const params: any[] = [];

    if (fromBlock !== null) {
      sql += " AND block_number >= ?";
      params.push(fromBlock);
    }
    if (toBlock !== null) {
      sql += " AND block_number <= ?";
      params.push(toBlock);
    }
    if (address) {
      sql += " AND (from_address = ? OR to_address = ?)";
      params.push(address.toLowerCase(), address.toLowerCase());
    }

    sql += " ORDER BY block_number DESC LIMIT ?";
    params.push(limit);

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getStats() {
    return new Promise((resolve, reject) => {
      const queries = [
        "SELECT COUNT(*) as total_events FROM events",
        "SELECT COUNT(*) as total_transactions FROM transactions",
        "SELECT COUNT(*) as total_blocks FROM blocks",
        "SELECT COUNT(*) as monitored_contracts FROM contracts",
        "SELECT MAX(number) as latest_block FROM blocks",
      ];

      Promise.all(
        queries.map(
          (sql) =>
            new Promise((res, rej) => {
              this.db.get(sql, (err, row) => {
                if (err) rej(err);
                else res(row);
              });
            })
        )
      )
        .then((results: any[]) => {
          resolve({
            totalEvents: results[0].total_events,
            totalTransactions: results[1].total_transactions,
            totalBlocks: results[2].total_blocks,
            monitoredContracts: results[3].monitored_contracts,
            latestBlock: results[4].latest_block,
            isRunning: this.isRunning,
          });
        })
        .catch(reject);
    });
  }

  close() {
    this.stop();
    this.db.close();
  }
}

export default Indexar;
