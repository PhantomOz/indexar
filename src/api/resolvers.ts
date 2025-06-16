import { GraphQLScalarType, Kind } from "graphql";
import type { ObjectValueNode } from "graphql";
import type { Context, Block, Transaction, Event, Contract } from "./types";
import type Indexar from "../services/indexar";
import type { Database } from "sqlite3";
import type { Pool } from "pg";
import pool from "../config/database";

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
      const client = await pool.connect();
      try {
        const result = await client.query<Block>(
          `
          SELECT number, hash, timestamp, processed_at as "processedAt"
          FROM blocks
          ORDER BY number DESC
          LIMIT $1
        `,
          [limit || 100]
        );
        return result.rows;
      } finally {
        client.release();
      }
    },

    block: async (
      _: unknown,
      { number }: { number: number },
      { indexar }: Context
    ) => {
      const client = await pool.connect();
      try {
        const result = await client.query<Block>(
          `
          SELECT number, hash, timestamp, processed_at as "processedAt"
          FROM blocks
          WHERE number = $1
        `,
          [number]
        );
        return result.rows[0] || null;
      } finally {
        client.release();
      }
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
      const client = await pool.connect();
      try {
        const result = await client.query<Contract>(`
          SELECT address, name, abi, created_at as "createdAt"
          FROM contracts
        `);
        return result.rows.map((row: Contract) => ({
          ...row,
          abi: row.abi, // PostgreSQL automatically parses JSONB
        }));
      } finally {
        client.release();
      }
    },
  },
};
