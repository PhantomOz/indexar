import type Indexar from "../services/indexar";

export interface Context {
  indexar: Indexar;
}

export interface Block {
  number: number;
  hash: string;
  timestamp: number;
  processedAt?: string;
}

export interface Transaction {
  hash: string;
  blockNumber: number;
  fromAddress: string;
  toAddress?: string;
  value: string;
  gasUsed: number;
  gasPrice: string;
  timestamp: number;
  status: number;
}

export interface Event {
  id: number;
  contractAddress: string;
  eventName: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  args: Record<string, any>;
  timestamp: number;
  createdAt?: string;
}

export interface Contract {
  address: string;
  name: string;
  abi: any;
  createdAt?: string;
}

export interface Stats {
  totalEvents: number;
  totalTransactions: number;
  totalBlocks: number;
  monitoredContracts: number;
  latestBlock?: number;
  isRunning: boolean;
}

export interface PaginationInfo {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginatedEvents {
  events: Event[];
  pagination: PaginationInfo;
}
