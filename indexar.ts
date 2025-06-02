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
}
