import { Router } from "express";
import type { Request, Response } from "express";
import type { Context } from "./types";
import pool from "../config/database";
import { getAllEvents, getEvents, getStats, getTransactions } from "./helper";

export function createRoutes(context: Context) {
  const router = Router();

  /**
   * @swagger
   * /api/health:
   *   get:
   *     summary: Health check endpoint
   *     description: Returns the health status of the Indexar service
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: Service is healthy
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: "ok"
   *                 message:
   *                   type: string
   *                   example: "Indexar service is running"
   */
  router.get("/health", (req: Request, res: Response) => {
    console.log("Health endpoint called");
    const response = { status: "ok", message: "Indexar service is running" };
    console.log("Sending response:", response);
    res.json(response);
  });

  /**
   * @swagger
   * /api/stats:
   *   get:
   *     summary: Get indexing statistics
   *     description: Returns comprehensive statistics about the indexed blockchain data
   *     tags: [Statistics]
   *     responses:
   *       200:
   *         description: Statistics retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Stats'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get("/stats", async (req: Request, res: Response) => {
    console.log("Stats endpoint called");
    console.log(context);
    try {
      const stats = await getStats();
      console.log("Stats retrieved:", stats);
      res.json(stats);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Stats error:", errorMessage);
      res
        .status(500)
        .json({ error: "Failed to fetch stats", details: errorMessage });
    }
  });

  /**
   * @swagger
   * /api/blocks:
   *   get:
   *     summary: Get blocks
   *     description: Returns a list of blocks with optional filtering by block number
   *     tags: [Blocks]
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 100
   *         description: Maximum number of blocks to return
   *       - in: query
   *         name: number
   *         schema:
   *           type: integer
   *         description: Get specific block by number
   *     responses:
   *       200:
   *         description: Blocks retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - type: array
   *                   items:
   *                     $ref: '#/components/schemas/Block'
   *                 - $ref: '#/components/schemas/Block'
   *       400:
   *         description: Invalid block number
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Block not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get("/blocks", async (req: Request, res: Response) => {
    console.log("Blocks endpoint called");
    try {
      const blockNumber = req.query.number
        ? parseInt(req.query.number as string)
        : null;
      const limit = parseInt(req.query.limit as string) || 100;

      console.log("Block query params:", { blockNumber, limit });

      const client = await pool.connect();

      try {
        if (blockNumber) {
          // Get specific block
          if (isNaN(blockNumber)) {
            return res.status(400).json({ error: "Invalid block number" });
          }

          const result = await client.query(
            `SELECT number, hash, timestamp, processed_at as "processedAt"
             FROM blocks
             WHERE number = $1`,
            [blockNumber]
          );

          if (result.rows.length === 0) {
            return res.status(404).json({ error: "Block not found" });
          }

          console.log("Block found:", result.rows[0]);
          res.json(result.rows[0]);
        } else {
          // Get recent blocks
          const result = await client.query(
            `SELECT number, hash, timestamp, processed_at as "processedAt"
             FROM blocks
             ORDER BY number DESC
             LIMIT $1`,
            [limit]
          );
          console.log(`Found ${result.rows.length} blocks`);
          res.json(result.rows);
        }
      } finally {
        client.release();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Blocks error:", errorMessage);
      res
        .status(500)
        .json({ error: "Failed to fetch blocks", details: errorMessage });
    }
  });

  /**
   * @swagger
   * /api/transactions:
   *   get:
   *     summary: Get transactions
   *     description: Returns a list of transactions with optional filtering
   *     tags: [Transactions]
   *     parameters:
   *       - in: query
   *         name: fromBlock
   *         schema:
   *           type: integer
   *         description: Filter transactions from this block number
   *       - in: query
   *         name: toBlock
   *         schema:
   *           type: integer
   *         description: Filter transactions up to this block number
   *       - in: query
   *         name: address
   *         schema:
   *           type: string
   *         description: Filter transactions by address (from or to)
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         description: Maximum number of transactions to return
   *     responses:
   *       200:
   *         description: Transactions retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Transaction'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get("/transactions", async (req: Request, res: Response) => {
    console.log("Transactions endpoint called");
    try {
      const fromBlock = req.query.fromBlock
        ? parseInt(req.query.fromBlock as string)
        : undefined;
      const toBlock = req.query.toBlock
        ? parseInt(req.query.toBlock as string)
        : undefined;
      const address = req.query.address as string;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string)
        : undefined;

      const transactions = await getTransactions({
        fromBlock,
        toBlock,
        address,
        limit,
      });

      console.log(`Found ${transactions.length} transactions`);
      res.json(transactions);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Transactions error:", errorMessage);
      res
        .status(500)
        .json({ error: "Failed to fetch transactions", details: errorMessage });
    }
  });

  /**
   * @swagger
   * /api/events:
   *   get:
   *     summary: Get events
   *     description: Returns a list of blockchain events with optional filtering
   *     tags: [Events]
   *     parameters:
   *       - in: query
   *         name: contractAddress
   *         schema:
   *           type: string
   *         description: Filter events by contract address
   *       - in: query
   *         name: eventName
   *         schema:
   *           type: string
   *         description: Filter events by event name
   *       - in: query
   *         name: fromBlock
   *         schema:
   *           type: integer
   *         description: Filter events from this block number
   *       - in: query
   *         name: toBlock
   *         schema:
   *           type: integer
   *         description: Filter events up to this block number
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         description: Maximum number of events to return
   *     responses:
   *       200:
   *         description: Events retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Event'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get("/events", async (req: Request, res: Response) => {
    console.log("Events endpoint called");
    try {
      const contractAddress = req.query.contractAddress as string;
      const eventName = req.query.eventName as string;
      const fromBlock = req.query.fromBlock
        ? parseInt(req.query.fromBlock as string)
        : undefined;
      const toBlock = req.query.toBlock
        ? parseInt(req.query.toBlock as string)
        : undefined;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string)
        : undefined;

      const events = await getEvents({
        contractAddress,
        eventName,
        fromBlock,
        toBlock,
        limit,
      });

      console.log(`Found ${events.length} events`);
      res.json(events);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Events error:", errorMessage);
      res
        .status(500)
        .json({ error: "Failed to fetch events", details: errorMessage });
    }
  });

  /**
   * @swagger
   * /api/events/all:
   *   get:
   *     summary: Get all events with pagination
   *     description: Returns paginated list of all events
   *     tags: [Events]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number
   *       - in: query
   *         name: pageSize
   *         schema:
   *           type: integer
   *           default: 100
   *         description: Number of events per page
   *     responses:
   *       200:
   *         description: Paginated events retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/PaginatedEvents'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get("/events/all", async (req: Request, res: Response) => {
    console.log("Events/all endpoint called");
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 100;
      console.log("I was called before await");
      const paginatedEvents = await getAllEvents(page, pageSize);
      console.log("Paginated events retrieved");
      res.json(paginatedEvents);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Events/all error:", errorMessage);
      res.status(500).json({
        error: "Failed to fetch paginated events",
        details: errorMessage,
      });
    }
  });

  /**
   * @swagger
   * /api/contracts:
   *   get:
   *     summary: Get monitored contracts
   *     description: Returns a list of all monitored smart contracts
   *     tags: [Contracts]
   *     responses:
   *       200:
   *         description: Contracts retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Contract'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get("/contracts", async (req: Request, res: Response) => {
    console.log("Contracts endpoint called");
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT address, name, abi, created_at as "createdAt"
           FROM contracts`
        );

        const contracts = result.rows.map((row: any) => ({
          ...row,
          abi: row.abi, // PostgreSQL automatically parses JSONB
        }));

        console.log(`Found ${contracts.length} contracts`);
        res.json(contracts);
      } finally {
        client.release();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Contracts error:", errorMessage);
      res
        .status(500)
        .json({ error: "Failed to fetch contracts", details: errorMessage });
    }
  });

  return router;
}
