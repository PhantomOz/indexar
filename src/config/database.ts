import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  user: process.env.POSTGRES_USER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.POSTGRES_DB || "indexar",
  password: process.env.POSTGRES_PASSWORD || "postgres",
  port: parseInt(process.env.PGPORT || "5432"),
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    console.error("Error connecting to PostgreSQL:", err);
    return;
  }
  console.log("Successfully connected to PostgreSQL");
  release();
});

export default pool;
