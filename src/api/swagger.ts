import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Indexar API",
      version: "1.0.0",
      description:
        "A blockchain indexing service API for querying blocks, transactions, events, and contracts",
      contact: {
        name: "Indexar Team",
        email: "support@indexar.com",
      },
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "Development server",
      },
      {
        url: "https://indexar-staging.up.railway.app",
        description: "Staging server",
      },
    ],
    components: {
      schemas: {
        Block: {
          type: "object",
          properties: {
            number: { type: "integer", description: "Block number" },
            hash: { type: "string", description: "Block hash" },
            timestamp: { type: "integer", description: "Block timestamp" },
            processedAt: {
              type: "string",
              description: "When the block was processed",
            },
          },
        },
        Transaction: {
          type: "object",
          properties: {
            hash: { type: "string", description: "Transaction hash" },
            blockNumber: { type: "integer", description: "Block number" },
            fromAddress: { type: "string", description: "Sender address" },
            toAddress: { type: "string", description: "Recipient address" },
            value: { type: "string", description: "Transaction value in wei" },
            gasUsed: { type: "integer", description: "Gas used" },
            gasPrice: { type: "string", description: "Gas price" },
            timestamp: {
              type: "integer",
              description: "Transaction timestamp",
            },
            status: { type: "integer", description: "Transaction status" },
          },
        },
        Event: {
          type: "object",
          properties: {
            id: { type: "integer", description: "Event ID" },
            contractAddress: {
              type: "string",
              description: "Contract address",
            },
            eventName: { type: "string", description: "Event name" },
            blockNumber: { type: "integer", description: "Block number" },
            transactionHash: {
              type: "string",
              description: "Transaction hash",
            },
            logIndex: { type: "integer", description: "Log index" },
            args: { type: "object", description: "Event arguments" },
            timestamp: { type: "integer", description: "Event timestamp" },
            createdAt: {
              type: "string",
              description: "When the event was indexed",
            },
          },
        },
        Contract: {
          type: "object",
          properties: {
            address: { type: "string", description: "Contract address" },
            name: { type: "string", description: "Contract name" },
            abi: { type: "object", description: "Contract ABI" },
            createdAt: {
              type: "string",
              description: "When the contract was added",
            },
          },
        },
        Stats: {
          type: "object",
          properties: {
            totalEvents: {
              type: "integer",
              description: "Total number of events indexed",
            },
            totalTransactions: {
              type: "integer",
              description: "Total number of transactions indexed",
            },
            totalBlocks: {
              type: "integer",
              description: "Total number of blocks indexed",
            },
            monitoredContracts: {
              type: "integer",
              description: "Number of monitored contracts",
            },
            latestBlock: {
              type: "integer",
              description: "Latest block number indexed",
            },
            isRunning: {
              type: "boolean",
              description: "Whether the indexer is running",
            },
          },
        },
        PaginationInfo: {
          type: "object",
          properties: {
            total: { type: "integer", description: "Total number of items" },
            page: { type: "integer", description: "Current page number" },
            pageSize: { type: "integer", description: "Items per page" },
            totalPages: {
              type: "integer",
              description: "Total number of pages",
            },
          },
        },
        PaginatedEvents: {
          type: "object",
          properties: {
            events: {
              type: "array",
              items: { $ref: "#/components/schemas/Event" },
            },
            pagination: { $ref: "#/components/schemas/PaginationInfo" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string", description: "Error message" },
            details: { type: "string", description: "Error details" },
          },
        },
      },
    },
  },
  apis: ["./src/api/routes.ts"], // Path to the API routes file
};

export const specs = swaggerJsdoc(options);
