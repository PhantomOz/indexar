import { EventEmitter } from "events";
import { ethers } from "ethers";
import pool from "../config/database";

class Indexar extends EventEmitter {
  provider: ethers.JsonRpcProvider;
  contracts: Map<
    string,
    { name: string; abi: ethers.InterfaceAbi; contract: ethers.Contract }
  >;
  lastProcessedBlock: number;
  batchSize: number;
  isRunning: boolean;

  constructor(config: {
    provider: ethers.JsonRpcProvider;
    dbPath: string; // Keeping for backward compatibility, not used with PostgreSQL
    batchSize: number;
    startBlock: number;
  }) {
    super();
    this.provider = config.provider;
    this.contracts = new Map();
    this.batchSize = config.batchSize;
    this.lastProcessedBlock = config.startBlock;
    this.isRunning = false;

    this.initializeDb();
  }

  async initializeDb() {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const tables = [
        `CREATE TABLE IF NOT EXISTS blocks (
          number INTEGER PRIMARY KEY,
          hash TEXT UNIQUE,
          timestamp INTEGER,
          processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS contracts (
          address TEXT PRIMARY KEY,
          name TEXT,
          abi JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS events (
          id SERIAL PRIMARY KEY,
          contract_address TEXT,
          event_name TEXT,
          block_number INTEGER,
          transaction_hash TEXT,
          log_index INTEGER,
          args JSONB,
          timestamp INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

      for (const sql of tables) {
        await client.query(sql);
      }

      const indexes = [
        "CREATE INDEX IF NOT EXISTS idx_events_contract ON events(contract_address)",
        "CREATE INDEX IF NOT EXISTS idx_events_block ON events(block_number)",
        "CREATE INDEX IF NOT EXISTS idx_events_name ON events(event_name)",
        "CREATE INDEX IF NOT EXISTS idx_transactions_block ON transactions(block_number)",
        "CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_address)",
        "CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_address)",
        "CREATE INDEX IF NOT EXISTS idx_events_tx_hash ON events(transaction_hash)",
        "CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp)",
      ];

      for (const sql of indexes) {
        await client.query(sql);
      }

      await client.query("COMMIT");
      console.log("Database initialized successfully");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Database initialization error:", err);
      throw err;
    } finally {
      client.release();
    }
  }

  async addContract(address: string, name: string, abi: ethers.InterfaceAbi) {
    try {
      const contract = new ethers.Contract(address, abi, this.provider);
      this.contracts.set(address, {
        name,
        abi,
        contract,
      });

      const client = await pool.connect();
      try {
        // Check if contract already exists
        const result = await client.query(
          "SELECT address FROM contracts WHERE address = $1",
          [address]
        );

        if (result.rows.length > 0) {
          console.log(`Contract ${name} already exists in database`);
          return;
        }

        // Insert new contract
        await client.query(
          "INSERT INTO contracts (address, name, abi) VALUES ($1, $2, $3) ON CONFLICT (address) DO NOTHING",
          [address, name, JSON.stringify(abi)]
        );
        console.log(`Contract ${name} added successfully`);
      } finally {
        client.release();
      }
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
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Process blocks sequentially but batch the database operations
          const blockValues = [];
          const transactionValues = [];
          const eventValues = [];

          for (
            let currentBlock = blockNumber;
            currentBlock <= end;
            currentBlock++
          ) {
            if (!this.isRunning) break;

            const block = await this.provider.getBlock(currentBlock);
            if (!block) {
              console.log(`Block ${currentBlock} not found, skipping`);
              continue;
            }

            // Collect block data
            blockValues.push([block.number, block.hash, block.timestamp]);

            // Process transactions
            for (const tx of block.transactions) {
              const txResponse = await this.provider.getTransaction(tx);
              const txReceipt = await this.provider.getTransactionReceipt(tx);

              if (txResponse && txReceipt) {
                transactionValues.push([
                  tx,
                  txResponse.blockNumber,
                  txResponse.from,
                  txResponse.to,
                  txResponse.value.toString(),
                  txReceipt.gasUsed,
                  txReceipt.gasPrice.toString(),
                  block.timestamp,
                  txReceipt.status,
                ]);
              }

              // Process events for each transaction
              for (const [address, contractInfo] of this.contracts) {
                const filter = {
                  address: address,
                  fromBlock: currentBlock,
                  toBlock: currentBlock,
                };

                const logs = await this.provider.getLogs(filter);
                for (const log of logs) {
                  const parsedLog =
                    contractInfo.contract.interface.parseLog(log);
                  if (parsedLog) {
                    const args: Record<string, any> = {};
                    parsedLog.args.forEach((arg, index) => {
                      const param = parsedLog.fragment.inputs[index];
                      args[param?.name ?? `arg${index}`] =
                        this.serializeValue(arg);
                    });

                    eventValues.push([
                      log.address.toLowerCase(),
                      parsedLog.name,
                      log.blockNumber,
                      log.transactionHash,
                      log.index,
                      JSON.stringify(args),
                      block.timestamp,
                    ]);
                  }
                }
              }
            }

            // Add a small delay between blocks to avoid rate limits
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          // Batch insert blocks
          if (blockValues.length > 0) {
            const blockQuery = `
              INSERT INTO blocks (number, hash, timestamp)
              VALUES ${blockValues
                .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
                .join(", ")}
              ON CONFLICT (number) DO NOTHING
            `;
            await client.query(blockQuery, blockValues.flat());
          }

          // Batch insert transactions
          if (transactionValues.length > 0) {
            const txQuery = `
              INSERT INTO transactions 
              (hash, block_number, from_address, to_address, value, gas_used, gas_price, timestamp, status)
              VALUES ${transactionValues
                .map(
                  (_, i) =>
                    `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${
                      i * 9 + 4
                    }, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${
                      i * 9 + 8
                    }, $${i * 9 + 9})`
                )
                .join(", ")}
              ON CONFLICT (hash) DO NOTHING
            `;
            await client.query(txQuery, transactionValues.flat());
          }

          // Batch insert events
          if (eventValues.length > 0) {
            const eventQuery = `
              INSERT INTO events 
              (contract_address, event_name, block_number, transaction_hash, log_index, args, timestamp)
              VALUES ${eventValues
                .map(
                  (_, i) =>
                    `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${
                      i * 7 + 4
                    }, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`
                )
                .join(", ")}
              ON CONFLICT (contract_address, transaction_hash, log_index) DO NOTHING
            `;
            await client.query(eventQuery, eventValues.flat());
          }

          await client.query("COMMIT");
          this.lastProcessedBlock = end;

          this.emit("progress", {
            processed: end,
            total: toBlock,
            percentage: ((end - fromBlock) / (toBlock - fromBlock)) * 100,
          });
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }

        // Increase delay between batches to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Error processing blocks:", error);
        // Add exponential backoff on error
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  async processBlock(blockNumber: number, isRealTime: boolean = true) {
    console.log(`Processing block ${blockNumber}`);
    let retries = 3;

    while (retries > 0) {
      try {
        const block = await this.provider.getBlock(blockNumber);
        if (!block) {
          console.log(`Block ${blockNumber} not found, skipping`);
          return;
        }

        const client = await pool.connect();
        try {
          await client.query(
            "INSERT INTO blocks (number, hash, timestamp) VALUES ($1, $2, $3) ON CONFLICT (number) DO NOTHING",
            [block.number, block.hash, block.timestamp]
          );

          // Process transactions sequentially
          for (const tx of block.transactions) {
            if (!this.isRunning) break;
            await this.processTransaction(tx, block.timestamp);
            // Add a small delay between transactions
            await new Promise((resolve) => setTimeout(resolve, 50));
          }

          // Process events
          await this.processBlockEvents(blockNumber);

          if (isRealTime) {
            this.lastProcessedBlock = blockNumber;
            this.emit("blockProcessed", {
              blockNumber,
              timestamp: block.timestamp,
            });
          }
        } finally {
          client.release();
        }

        // Success, break the retry loop
        break;
      } catch (error: any) {
        retries--;
        if (error?.code === 429 || error?.message?.includes("rate limit")) {
          console.log(
            `Rate limit hit, retrying in 5 seconds... (${retries} retries left)`
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } else {
          console.error("Error processing block:", error);
          if (retries === 0) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  }

  async processTransaction(tx: string, timestamp: number) {
    try {
      const txResponse = await this.provider.getTransaction(tx);
      const txReceipt = await this.provider.getTransactionReceipt(tx);

      if (!txResponse || !txReceipt) {
        console.warn(
          `Transaction ${tx} not found or receipt missing, skipping`
        );
        return;
      }

      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO transactions 
           (hash, block_number, from_address, to_address, value, gas_used, gas_price, timestamp, status) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (hash) DO NOTHING`,
          [
            tx,
            txResponse.blockNumber,
            txResponse.from,
            txResponse.to,
            txResponse.value.toString(),
            txReceipt.gasUsed,
            txReceipt.gasPrice.toString(),
            timestamp,
            txReceipt.status,
          ]
        );
      } finally {
        client.release();
      }
    } catch (error) {
      console.warn("Error processing transaction:", error);
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

      const block = await this.provider.getBlock(log.blockNumber);
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO events 
           (contract_address, event_name, block_number, transaction_hash, log_index, args, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (contract_address, transaction_hash, log_index) DO NOTHING`,
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
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error processing event:", error);
    }
  }

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

    let sql = `
      WITH filtered_events AS (
        SELECT 
          id,
          contract_address as "contractAddress",
          event_name as "eventName",
          block_number as "blockNumber",
          transaction_hash as "transactionHash",
          log_index as "logIndex",
          args,
          timestamp,
          created_at as "createdAt",
          ROW_NUMBER() OVER (
            PARTITION BY contract_address, transaction_hash, log_index 
            ORDER BY created_at DESC
          ) as rn
        FROM events 
        WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (contractAddress) {
      sql += ` AND contract_address = $${paramCount}`;
      params.push(contractAddress.toLowerCase());
      paramCount++;
    }

    if (eventName) {
      sql += ` AND event_name = $${paramCount}`;
      params.push(eventName);
      paramCount++;
    }

    if (fromBlock) {
      sql += ` AND block_number >= $${paramCount}`;
      params.push(fromBlock);
      paramCount++;
    }

    if (toBlock) {
      sql += ` AND block_number <= $${paramCount}`;
      params.push(toBlock);
      paramCount++;
    }

    sql += `
      )
      SELECT 
        id,
        "contractAddress",
        "eventName",
        "blockNumber",
        "transactionHash",
        "logIndex",
        args,
        timestamp,
        "createdAt"
      FROM filtered_events
      WHERE rn = 1
      ORDER BY "blockNumber" DESC, "logIndex" DESC 
      LIMIT $${paramCount}
    `;
    params.push(limit);

    const client = await pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows.map((row) => ({
        ...row,
        args: row.args, // PostgreSQL automatically parses JSONB
      }));
    } finally {
      client.release();
    }
  }

  async getTransactions(query: {
    fromBlock?: number;
    toBlock?: number;
    address?: string;
    limit?: number;
  }) {
    const { fromBlock, toBlock, address, limit = 100 } = query;
    let sql = `
      SELECT 
        hash,
        block_number as "blockNumber",
        from_address as "fromAddress",
        to_address as "toAddress",
        COALESCE(value, '0') as value,
        COALESCE(gas_used, 0) as "gasUsed",
        COALESCE(gas_price, '0') as "gasPrice",
        COALESCE(timestamp, 0) as timestamp,
        COALESCE(status, 0) as status
      FROM transactions 
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (fromBlock !== undefined) {
      sql += ` AND block_number >= $${paramCount}`;
      params.push(fromBlock);
      paramCount++;
    }
    if (toBlock !== undefined) {
      sql += ` AND block_number <= $${paramCount}`;
      params.push(toBlock);
      paramCount++;
    }
    if (address) {
      sql += ` AND (from_address = $${paramCount} OR to_address = $${paramCount})`;
      params.push(address.toLowerCase(), address.toLowerCase());
      paramCount += 2;
    }

    sql += ` ORDER BY block_number DESC LIMIT $${paramCount}`;
    params.push(limit);

    const client = await pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getStats() {
    const client = await pool.connect();
    try {
      const queries = [
        "SELECT COUNT(*) as total_events FROM events",
        "SELECT COUNT(*) as total_transactions FROM transactions",
        "SELECT COUNT(*) as total_blocks FROM blocks",
        "SELECT COUNT(*) as monitored_contracts FROM contracts",
        "SELECT MAX(number) as latest_block FROM blocks",
      ];

      const results = await Promise.all(
        queries.map((sql) => client.query(sql))
      );

      const stats = {
        totalEvents: parseInt(results[0]?.rows[0]?.total_events || "0"),
        totalTransactions: parseInt(
          results[1]?.rows[0]?.total_transactions || "0"
        ),
        totalBlocks: parseInt(results[2]?.rows[0]?.total_blocks || "0"),
        monitoredContracts: parseInt(
          results[3]?.rows[0]?.monitored_contracts || "0"
        ),
        latestBlock: results[4]?.rows[0]?.latest_block || null,
        isRunning: this.isRunning,
      };

      return stats;
    } finally {
      client.release();
    }
  }

  async getAllEvents(page: number = 1, pageSize: number = 100) {
    const offset = (page - 1) * pageSize;
    const client = await pool.connect();
    try {
      const countResult = await client.query(
        "SELECT COUNT(*) as total FROM events WHERE event_name IS NOT NULL"
      );

      const total = parseInt(countResult.rows[0].total);

      const result = await client.query(
        `SELECT 
          id,
          contract_address as "contractAddress",
          event_name as "eventName",
          block_number as "blockNumber",
          transaction_hash as "transactionHash",
          log_index as "logIndex",
          args,
          timestamp,
          created_at as "createdAt"
        FROM events 
        WHERE event_name IS NOT NULL
        ORDER BY block_number DESC, log_index DESC 
        LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      );

      return {
        events: result.rows.map((row) => ({
          ...row,
          args: row.args, // PostgreSQL automatically parses JSONB
        })),
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } finally {
      client.release();
    }
  }

  close() {
    this.stop();
    // No need to close the pool as it's managed by the application
  }

  // Helper method to serialize values for JSON storage
  private serializeValue(value: any): any {
    if (value === null || value === undefined) return null;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        return value.map((v) => this.serializeValue(v));
      }
      const obj: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        obj[key] = this.serializeValue(val);
      }
      return obj;
    }
    return value;
  }
}

export default Indexar;
