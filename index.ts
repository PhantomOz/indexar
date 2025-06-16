import { ethers } from "ethers";
import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import IndexarManager from "./src/services/IndexarManager";
import LendBitAbi from "./abis/LendBit.json";
import { typeDefs } from "./src/api/schema";
import { resolvers } from "./src/api/resolvers";
import type { Context } from "./src/api/types";
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

  // Start Indexar service

  // Initialize Apollo Server
  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
    introspection: true, // Enable introspection
  });

  // Start Apollo Server
  const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },
    context: async () => ({
      indexar, // Make indexar instance available in resolvers
    }),
  });

  console.log(`🚀 Indexar service started`);
  console.log(`🚀 GraphQL server ready at ${url}`);
  console.log(`🚀 Apollo Studio Explorer available at ${url}`);
  await indexar.start();
}

main().catch((error) => {
  console.error("Error starting application:", error);
  process.exit(1);
});
