import pool from "../config/database";

async function getEvents(query: {
  contractAddress?: string;
  eventName?: string;
  fromBlock?: number;
  toBlock?: number;
  limit?: number;
}) {
  const { contractAddress, eventName, fromBlock, toBlock, limit = 100 } = query;

  let sql = `
      WITH filtered_events AS (
        SELECT 
          id,
          contract_address as "contractAddress",
          event_name as "eventName",
          block_number as "blockNumber",
          transaction_hash as "transactionHash",
          log_index as "logIndex",
          args,
          timestamp,
          created_at as "createdAt",
          ROW_NUMBER() OVER (
            PARTITION BY contract_address, transaction_hash, log_index 
            ORDER BY created_at DESC
          ) as rn
        FROM events 
        WHERE 1=1
    `;
  const params: any[] = [];
  let paramCount = 1;

  if (contractAddress) {
    sql += ` AND contract_address = $${paramCount}`;
    params.push(contractAddress.toLowerCase());
    paramCount++;
  }

  if (eventName) {
    sql += ` AND event_name = $${paramCount}`;
    params.push(eventName);
    paramCount++;
  }

  if (fromBlock) {
    sql += ` AND block_number >= $${paramCount}`;
    params.push(fromBlock);
    paramCount++;
  }

  if (toBlock) {
    sql += ` AND block_number <= $${paramCount}`;
    params.push(toBlock);
    paramCount++;
  }

  sql += `
      )
      SELECT 
        id,
        "contractAddress",
        "eventName",
        "blockNumber",
        "transactionHash",
        "logIndex",
        args,
        timestamp,
        "createdAt"
      FROM filtered_events
      WHERE rn = 1
      ORDER BY "blockNumber" DESC, "logIndex" DESC 
      LIMIT $${paramCount}
    `;
  params.push(limit);

  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows.map((row) => ({
      ...row,
      args: row.args, // PostgreSQL automatically parses JSONB
    }));
  } finally {
    client.release();
  }
}

async function getTransactions(query: {
  fromBlock?: number;
  toBlock?: number;
  address?: string;
  limit?: number;
}) {
  const { fromBlock, toBlock, address, limit = 100 } = query;
  let sql = `
      SELECT 
        hash,
        block_number as "blockNumber",
        from_address as "fromAddress",
        to_address as "toAddress",
        COALESCE(value, '0') as value,
        COALESCE(gas_used, 0) as "gasUsed",
        COALESCE(gas_price, '0') as "gasPrice",
        COALESCE(timestamp, 0) as timestamp,
        COALESCE(status, 0) as status
      FROM transactions 
      WHERE 1=1
    `;
  const params: any[] = [];
  let paramCount = 1;

  if (fromBlock !== undefined) {
    sql += ` AND block_number >= $${paramCount}`;
    params.push(fromBlock);
    paramCount++;
  }
  if (toBlock !== undefined) {
    sql += ` AND block_number <= $${paramCount}`;
    params.push(toBlock);
    paramCount++;
  }
  if (address) {
    sql += ` AND (from_address = $${paramCount} OR to_address = $${paramCount})`;
    params.push(address.toLowerCase(), address.toLowerCase());
    paramCount += 2;
  }

  sql += ` ORDER BY block_number DESC LIMIT $${paramCount}`;
  params.push(limit);

  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getStats() {
  const client = await pool.connect();
  try {
    const queries = [
      "SELECT COUNT(*) as total_events FROM events",
      "SELECT COUNT(*) as total_transactions FROM transactions",
      "SELECT COUNT(*) as total_blocks FROM blocks",
      "SELECT COUNT(*) as monitored_contracts FROM contracts",
      "SELECT MAX(number) as latest_block FROM blocks",
    ];

    const results = await Promise.all(queries.map((sql) => client.query(sql)));

    const stats = {
      totalEvents: parseInt(results[0]?.rows[0]?.total_events || "0"),
      totalTransactions: parseInt(
        results[1]?.rows[0]?.total_transactions || "0"
      ),
      totalBlocks: parseInt(results[2]?.rows[0]?.total_blocks || "0"),
      monitoredContracts: parseInt(
        results[3]?.rows[0]?.monitored_contracts || "0"
      ),
      latestBlock: results[4]?.rows[0]?.latest_block || null,
      isRunning: true,
    };

    return stats;
  } finally {
    client.release();
  }
}

async function getAllEvents(page: number = 1, pageSize: number = 100) {
  const offset = (page - 1) * pageSize;
  const client = await pool.connect();
  try {
    const countResult = await client.query(
      "SELECT COUNT(*) as total FROM events WHERE event_name IS NOT NULL"
    );

    const total = parseInt(countResult.rows[0].total);

    const result = await client.query(
      `SELECT 
          id,
          contract_address as "contractAddress",
          event_name as "eventName",
          block_number as "blockNumber",
          transaction_hash as "transactionHash",
          log_index as "logIndex",
          args,
          timestamp,
          created_at as "createdAt"
        FROM events 
        WHERE event_name IS NOT NULL
        ORDER BY block_number DESC, log_index DESC 
        LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    return {
      events: result.rows.map((row: any) => ({
        ...row,
        args: row.args, // PostgreSQL automatically parses JSONB
      })),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  } finally {
    client.release();
  }
}

export { getAllEvents, getStats, getEvents, getTransactions };
