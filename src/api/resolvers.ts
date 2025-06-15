import { GraphQLScalarType, Kind } from "graphql";
import type { ObjectValueNode } from "graphql";
import type { Context, Block, Transaction, Event, Contract } from "./types";
import type Indexar from "../services/indexar";
import type { Database } from "sqlite3";

// Custom JSON scalar type
const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "JSON custom scalar type",
  serialize(value) {
    return value;
  },
  parseValue(value) {
    return value;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.OBJECT) {
      const obj: Record<string, any> = {};
      (ast as ObjectValueNode).fields.forEach((field) => {
        obj[field.name.value] = field.value;
      });
      return obj;
    }
    return null;
  },
});

export const resolvers = {
  JSON: JSONScalar,

  Query: {
    health: () => "ok",

    stats: async (_: unknown, __: unknown, { indexar }: Context) => {
      return await indexar.getStats();
    },

    blocks: async (
      _: unknown,
      { limit }: { limit?: number },
      { indexar }: Context
    ) => {
      const sql = `
        SELECT number, hash, timestamp, processed_at as processedAt
        FROM blocks
        ORDER BY number DESC
        LIMIT ?
      `;
      return new Promise<Block[]>((resolve, reject) => {
        indexar.db.all(
          sql,
          [limit || 100],
          (err: Error | null, rows: Block[]) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });
    },

    block: async (
      _: unknown,
      { number }: { number: number },
      { indexar }: Context
    ) => {
      const sql = `
        SELECT number, hash, timestamp, processed_at as processedAt
        FROM blocks
        WHERE number = ?
      `;
      return new Promise<Block | null>((resolve, reject) => {
        indexar.db.get(
          sql,
          [number],
          (err: Error | null, row: Block | null) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
    },

    transactions: async (
      _: unknown,
      {
        fromBlock,
        toBlock,
        address,
        limit,
      }: {
        fromBlock?: number;
        toBlock?: number;
        address?: string;
        limit?: number;
      },
      { indexar }: Context
    ) => {
      return await indexar.getTransactions({
        fromBlock,
        toBlock,
        address,
        limit,
      });
    },

    events: async (
      _: unknown,
      {
        contractAddress,
        eventName,
        fromBlock,
        toBlock,
        limit,
      }: {
        contractAddress?: string;
        eventName?: string;
        fromBlock?: number;
        toBlock?: number;
        limit?: number;
      },
      { indexar }: Context
    ) => {
      return await indexar.getEvents({
        contractAddress,
        eventName,
        fromBlock,
        toBlock,
        limit,
      });
    },

    getAllEvents: async (
      _: unknown,
      { page = 1, pageSize = 100 }: { page?: number; pageSize?: number },
      { indexar }: Context
    ) => {
      return await indexar.getAllEvents(page, pageSize);
    },

    contracts: async (_: unknown, __: unknown, { indexar }: Context) => {
      const sql = `
        SELECT address, name, abi, created_at as createdAt
        FROM contracts
      `;
      return new Promise<Contract[]>((resolve, reject) => {
        indexar.db.all(sql, [], (err: Error | null, rows: any[]) => {
          if (err) reject(err);
          else
            resolve(
              rows.map((row: any) => ({
                ...row,
                abi: JSON.parse(row.abi),
              }))
            );
        });
      });
    },
  },
};
