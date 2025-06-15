import { gql } from "graphql-tag";

export const typeDefs = gql`
  type Block {
    number: Int!
    hash: String!
    timestamp: Int!
    processedAt: String
  }

  type Transaction {
    hash: String!
    blockNumber: Int!
    fromAddress: String!
    toAddress: String
    value: String!
    gasUsed: Int
    gasPrice: String
    timestamp: Int
    status: Int
  }

  type Event {
    id: Int!
    contractAddress: String
    eventName: String!
    blockNumber: Int!
    transactionHash: String!
    logIndex: Int!
    args: JSON!
    timestamp: Int!
    createdAt: String
  }

  type Contract {
    address: String!
    name: String!
    abi: JSON!
    createdAt: String
  }

  type Stats {
    totalEvents: Int!
    totalTransactions: Int!
    totalBlocks: Int!
    monitoredContracts: Int!
    latestBlock: Int
    isRunning: Boolean!
  }

  type PaginationInfo {
    total: Int!
    page: Int!
    pageSize: Int!
    totalPages: Int!
  }

  type PaginatedEvents {
    events: [Event!]!
    pagination: PaginationInfo!
  }

  scalar JSON

  type Query {
    health: String!
    stats: Stats!
    blocks(limit: Int): [Block!]!
    block(number: Int!): Block
    transactions(
      fromBlock: Int
      toBlock: Int
      address: String
      limit: Int
    ): [Transaction!]!
    events(
      contractAddress: String
      eventName: String
      fromBlock: Int
      toBlock: Int
      limit: Int
    ): [Event!]!
    getAllEvents(page: Int, pageSize: Int): PaginatedEvents!
    contracts: [Contract!]!
  }
`;
