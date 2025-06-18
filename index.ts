import { ethers } from "ethers";
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import IndexarManager from "./src/services/IndexarManager";
import LendBitAbi from "./abis/LendBit.json";
import type { Context } from "./src/api/types";
import { createRoutes } from "./src/api/routes";
import { specs } from "./src/api/swagger";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  // Initialize Indexar
  const config = {
    provider: new ethers.JsonRpcProvider(process.env.RPC_URL),
    dbPath: "./indexar.db",
    batchSize: 50,
    startBlock: await new ethers.JsonRpcProvider(
      process.env.RPC_URL
    ).getBlockNumber(),
  };

  const indexarManager = new IndexarManager();
  const indexar = await indexarManager.initialize(config);

  const contracts = [
    {
      address: "0x820507043F0abdC50C629B09cbC61323967331e3",
      name: "LendBit",
      abi: LendBitAbi,
    },
    {
      address: "0x052C88f4f88c9330f6226cdC120ba173416134C3",
      name: "LendBitV1",
      abi: LendBitAbi,
    },
  ];

  await indexarManager.addBatchContracts(contracts);

  // DEBUG: Comment out indexer start to test API endpoints
  // Start the indexer in the background
  // indexar.start().catch((error) => {
  //   console.error("Indexer error:", error);
  // });

  // Initialize Express app
  const app = express();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Swagger documentation
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(specs, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Indexar API Documentation",
      customfavIcon: "/favicon.ico",
    })
  );

  // API routes
  const context: Context = { indexar };
  const apiRoutes = createRoutes(context);

  // Test route
  app.get("/test", (req, res) => {
    res.json({ message: "Test route working" });
  });

  app.use("/api", apiRoutes);

  // Root endpoint
  app.get("/", (req, res) => {
    res.json({
      message: "Indexar API",
      version: "1.0.0",
      documentation: "/api-docs",
      endpoints: {
        health: "/api/health",
        stats: "/api/stats",
        blocks: "/api/blocks",
        transactions: "/api/transactions",
        events: "/api/events",
        contracts: "/api/contracts",
      },
    });
  });

  // Error handling middleware
  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      console.error("Error:", err);
      res.status(500).json({
        error: "Internal server error",
        message: err.message || "Something went wrong",
      });
    }
  );

  // 404 handler
  app.use("*", (req, res) => {
    res.status(404).json({
      error: "Not found",
      message: `Route ${req.originalUrl} not found`,
    });
  });

  // Start server
  app.listen(port, () => {
    console.log(`🚀 Indexar service started`);
    console.log(`🚀 Express server ready at http://localhost:${port}`);
    console.log(
      `🚀 API Documentation available at http://localhost:${port}/api-docs`
    );
    console.log(
      `🚀 Health check available at http://localhost:${port}/api/health`
    );
    console.log(`🔧 DEBUG MODE: Indexer disabled for testing`);
  });
}

main().catch((error) => {
  console.error("Error starting application:", error);
  process.exit(1);
});
