import { EventEmitter } from "events";
import { ethers } from "ethers";
import Block from "../models/Block";
import Contract from "../models/Contract";
import Event from "../models/Event";
import Transaction from "../models/Transaction";
import { connectMongo } from "../config/mongodb";

class Indexar extends EventEmitter {
  provider: ethers.JsonRpcProvider;
  contracts: Map<
    string,
    { name: string; abi: ethers.InterfaceAbi; contract: ethers.Contract }
  >;
  lastProcessedBlock: number;
  batchSize: number;
  public isRunning: boolean;

  constructor(config: {
    provider: ethers.JsonRpcProvider;
    dbPath: string; // Not used with MongoDB
    batchSize: number;
    startBlock: number;
  }) {
    super();
    this.provider = config.provider;
    this.contracts = new Map();
    this.batchSize = config.batchSize;
    this.lastProcessedBlock = config.startBlock;
    this.isRunning = false;
    connectMongo();
  }

  async addContract(address: string, name: string, abi: ethers.InterfaceAbi) {
    try {
      const contract = new ethers.Contract(address, abi, this.provider);
      this.contracts.set(address, {
        name,
        abi,
        contract,
      });
      await Contract.updateOne(
        { address },
        { $setOnInsert: { name, abi } },
        { upsert: true }
      );
      console.log(`Contract ${name} added successfully`);
    } catch (error) {
      if ((error as any).code === 11000) {
        console.log(`Contract ${name} already exists in database`);
      } else {
        console.error("Error adding contract:", error);
      }
    }
  }

  async removeContract(address: string) {
    try {
      const contractInfo = this.contracts.get(address);
      if (!contractInfo) {
        console.log(`Contract ${address} not found in memory`);
        return;
      }
      this.contracts.delete(address);
      console.log(`Contract ${contractInfo.name} removed from memory`);
      const result = await Contract.deleteOne({ address });
      if (result.deletedCount > 0) {
        console.log(`Contract ${contractInfo.name} removed from database`);
      } else {
        console.log(`Contract ${address} not found in database`);
      }
    } catch (error) {
      console.error("Error removing contract:", error);
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
          blockValues.push({
            number: block.number,
            hash: block.hash,
            timestamp: block.timestamp,
          });
          for (const tx of block.transactions) {
            const txResponse = await this.provider.getTransaction(tx);
            const txReceipt = await this.provider.getTransactionReceipt(tx);
            if (txResponse && txReceipt) {
              transactionValues.push({
                hash: tx,
                block_number: txResponse.blockNumber,
                from_address: txResponse.from,
                to_address: txResponse.to,
                value: txResponse.value.toString(),
                gas_used: txReceipt.gasUsed,
                gas_price: txReceipt.gasPrice.toString(),
                timestamp: block.timestamp,
                status: txReceipt.status,
              });
            }
            for (const [address, contractInfo] of this.contracts) {
              const filter = {
                address: address,
                fromBlock: currentBlock,
                toBlock: currentBlock,
              };
              const logs = await this.provider.getLogs(filter);
              for (const log of logs) {
                const parsedLog = contractInfo.contract.interface.parseLog(log);
                if (parsedLog) {
                  const args: Record<string, any> = {};
                  parsedLog.args.forEach((arg, index) => {
                    const param = parsedLog.fragment.inputs[index];
                    args[param?.name ?? `arg${index}`] =
                      this.serializeValue(arg);
                  });
                  eventValues.push({
                    contract_address: log.address.toLowerCase(),
                    event_name: parsedLog.name,
                    block_number: log.blockNumber,
                    transaction_hash: log.transactionHash,
                    log_index: log.index,
                    args,
                    timestamp: block.timestamp,
                  });
                }
              }
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (blockValues.length > 0) {
          await Block.insertMany(blockValues, { ordered: false }).catch(
            () => {}
          );
        }
        if (transactionValues.length > 0) {
          console.log("Transactions Length >>", transactionValues.length);
          await Transaction.insertMany(transactionValues, {
            ordered: false,
          }).catch(() => {});
        }
        if (eventValues.length > 0) {
          await Event.insertMany(eventValues, { ordered: false }).catch(
            () => {}
          );
        }
        this.lastProcessedBlock = end;
        this.emit("progress", {
          processed: end,
          total: toBlock,
          percentage: ((end - fromBlock) / (toBlock - fromBlock)) * 100,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Error processing blocks:", error);
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
        await Block.updateOne(
          { number: block.number },
          { $setOnInsert: { hash: block.hash, timestamp: block.timestamp } },
          { upsert: true }
        );
        for (const tx of block.transactions) {
          if (!this.isRunning) break;
          await this.processTransaction(tx, block.timestamp);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await this.processBlockEvents(blockNumber);
        if (isRealTime) {
          this.lastProcessedBlock = blockNumber;
          this.emit("blockProcessed", {
            blockNumber,
            timestamp: block.timestamp,
          });
        }
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
      await Transaction.updateOne(
        { hash: tx },
        {
          $setOnInsert: {
            block_number: txResponse.blockNumber,
            from_address: txResponse.from,
            to_address: txResponse.to,
            value: txResponse.value.toString(),
            gas_used: txReceipt.gasUsed,
            gas_price: txReceipt.gasPrice.toString(),
            timestamp,
            status: txReceipt.status,
          },
        },
        { upsert: true }
      );
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
      await Event.updateOne(
        {
          contract_address: log.address.toLowerCase(),
          transaction_hash: log.transactionHash,
          log_index: log.index,
        },
        {
          $setOnInsert: {
            event_name: parsedLog.name,
            block_number: log.blockNumber,
            args,
            timestamp: block?.timestamp,
          },
        },
        { upsert: true }
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

  close() {
    this.stop();
  }

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

  async clearDatabase() {
    await Event.deleteMany({});
    await Transaction.deleteMany({});
    await Block.deleteMany({});
    await Contract.deleteMany({});
    this.contracts.clear();
    this.lastProcessedBlock = 0;
    console.log("Database cleared successfully");
  }
}

export default Indexar;
