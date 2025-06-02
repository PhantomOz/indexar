import { EventEmitter } from "events";
import { ethers } from "ethers";
import sqlite3 from "sqlite3";

class Indexar extends EventEmitter {
  provider: ethers.JsonRpcProvider;
  db: sqlite3.Database;
  contracts: Map<string, ethers.Contract>;
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
}
