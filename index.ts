import { ethers } from "ethers";
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import type { Context } from "./src/api/types";
import { createRoutes } from "./src/api/routes";
import { specs } from "./src/api/swagger";
import dotenv from "dotenv";
import { connectMongo } from "./src/config/mongodb";

dotenv.config();

async function main() {
  // Ensure MongoDB is connected before anything else
  try {
    await connectMongo();
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  }

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
  // The context will be set up by the worker/indexer process, so here we just pass an empty object or a stub
  const context: Context = {} as Context;
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
    console.log(`🚀 Express server ready at http://localhost:${port}`);
    console.log(
      `🚀 API Documentation available at http://localhost:${port}/api-docs`
    );
    console.log(
      `🚀 Health check available at http://localhost:${port}/api/health`
    );
  });
}

main().catch((error) => {
  console.error("Error starting application:", error);
  process.exit(1);
});
