import Event from "../models/Event";
import Transaction from "../models/Transaction";
import Block from "../models/Block";
import Contract from "../models/Contract";

async function getEvents(query: {
  contractAddress?: string;
  eventName?: string;
  fromBlock?: number;
  toBlock?: number;
  limit?: number;
}) {
  const { contractAddress, eventName, fromBlock, toBlock, limit = 100 } = query;
  const filter: any = {};
  if (contractAddress) filter.contract_address = contractAddress.toLowerCase();
  if (eventName) filter.event_name = eventName;
  if (fromBlock !== undefined)
    filter.block_number = { ...filter.block_number, $gte: fromBlock };
  if (toBlock !== undefined)
    filter.block_number = { ...filter.block_number, $lte: toBlock };

  const events = await Event.find(filter)
    .sort({ block_number: -1, log_index: -1 })
    .limit(limit)
    .lean();

  return events.map((row: any) => ({
    id: row._id,
    contractAddress: row.contract_address,
    eventName: row.event_name,
    blockNumber: row.block_number,
    transactionHash: row.transaction_hash,
    logIndex: row.log_index,
    args: row.args,
    timestamp: row.timestamp,
    createdAt: row.created_at,
  }));
}

async function getTransactions(query: {
  fromBlock?: number;
  toBlock?: number;
  address?: string;
  limit?: number;
}) {
  const { fromBlock, toBlock, address, limit = 100 } = query;
  const filter: any = {};
  if (fromBlock !== undefined)
    filter.block_number = { ...filter.block_number, $gte: fromBlock };
  if (toBlock !== undefined)
    filter.block_number = { ...filter.block_number, $lte: toBlock };
  if (address) {
    filter.$or = [
      { from_address: address.toLowerCase() },
      { to_address: address.toLowerCase() },
    ];
  }
  const txs = await Transaction.find(filter)
    .sort({ block_number: -1 })
    .limit(limit)
    .lean();
  return txs.map((row: any) => ({
    hash: row.hash,
    blockNumber: row.block_number,
    fromAddress: row.from_address,
    toAddress: row.to_address,
    value: row.value || "0",
    gasUsed: row.gas_used || 0,
    gasPrice: row.gas_price || "0",
    timestamp: row.timestamp || 0,
    status: row.status || 0,
  }));
}

async function getStats() {
  const [
    totalEvents,
    totalTransactions,
    totalBlocks,
    monitoredContracts,
    latestBlock,
  ] = await Promise.all([
    Event.countDocuments({}),
    Transaction.countDocuments({}),
    Block.countDocuments({}),
    Contract.countDocuments({}),
    Block.findOne({}).sort({ number: -1 }).lean(),
  ]);
  return {
    totalEvents,
    totalTransactions,
    totalBlocks,
    monitoredContracts,
    latestBlock: latestBlock ? latestBlock.number : null,
    isRunning: true,
  };
}

async function getAllEvents(page: number = 1, pageSize: number = 100) {
  const skip = (page - 1) * pageSize;
  const [total, events] = await Promise.all([
    Event.countDocuments({ event_name: { $ne: null } }),
    Event.find({ event_name: { $ne: null } })
      .sort({ block_number: -1, log_index: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
  ]);
  return {
    events: events.map((row: any) => ({
      id: row._id,
      contractAddress: row.contract_address,
      eventName: row.event_name,
      blockNumber: row.block_number,
      transactionHash: row.transaction_hash,
      logIndex: row.log_index,
      args: row.args,
      timestamp: row.timestamp,
      createdAt: row.created_at,
    })),
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export { getAllEvents, getStats, getEvents, getTransactions };
