export const resolvers: {
  JSON: any;
  Query: {
    health: () => string;
    stats: (
      parent: unknown,
      args: unknown,
      context: { indexar: any }
    ) => Promise<any>;
    blocks: (
      parent: unknown,
      args: { limit?: number },
      context: { indexar: any }
    ) => Promise<any[]>;
    block: (
      parent: unknown,
      args: { number: number },
      context: { indexar: any }
    ) => Promise<any>;
    transactions: (
      parent: unknown,
      args: {
        fromBlock?: number;
        toBlock?: number;
        address?: string;
        limit?: number;
      },
      context: { indexar: any }
    ) => Promise<any[]>;
    events: (
      parent: unknown,
      args: {
        contractAddress?: string;
        eventName?: string;
        fromBlock?: number;
        toBlock?: number;
        limit?: number;
      },
      context: { indexar: any }
    ) => Promise<any[]>;
    contracts: (
      parent: unknown,
      args: unknown,
      context: { indexar: any }
    ) => Promise<any[]>;
  };
};
