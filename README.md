# Indexar - Blockchain Event Indexer

A real-time blockchain event indexer built with Node.js, Ethers.js, and MongoDB.

## Features

- Real-time blockchain event indexing
- Support for multiple smart contracts
- MongoDB storage with upsert operations
- Configurable rate limiting to prevent API throttling
- Event-driven architecture with progress tracking

## Installation

```bash
npm install
```

## Configuration

### Rate Limiting

The indexer includes configurable rate limiting to prevent hitting API rate limits (especially important for Alchemy and other RPC providers):

```typescript
const indexar = new Indexar({
  provider: new ethers.JsonRpcProvider(ALCHEMY_URL),
  dbPath: "mongodb://localhost:27017/indexar",
  batchSize: 10,
  startBlock: 18000000,
  rateLimits: {
    transactionDelay: 200,    // Delay between processing transactions (ms)
    eventDelay: 100,          // Delay between API calls in transaction processing (ms)
    contractDelay: 150,       // Delay between contract event processing (ms)
    blockDelay: 50,           // Delay between block processing (ms)
    maxRetries: 3,            // Maximum retry attempts for rate limit errors
  }
});
```

### Recommended Rate Limits for Different Providers

**Alchemy (Free Tier):**
```typescript
rateLimits: {
  transactionDelay: 300,    // More conservative for free tier
  eventDelay: 150,
  contractDelay: 200,
  blockDelay: 100,
  maxRetries: 3,
}
```

**Alchemy (Paid Tier):**
```typescript
rateLimits: {
  transactionDelay: 200,    // Can be more aggressive
  eventDelay: 100,
  contractDelay: 150,
  blockDelay: 50,
  maxRetries: 3,
}
```

**Infura:**
```typescript
rateLimits: {
  transactionDelay: 250,
  eventDelay: 120,
  contractDelay: 180,
  blockDelay: 75,
  maxRetries: 3,
}
```

## Usage

```typescript
import Indexar from './src/services/indexar';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_URL);

const indexar = new Indexar({
  provider,
  dbPath: "mongodb://localhost:27017/indexar",
  batchSize: 10,
  startBlock: 18000000,
  rateLimits: {
    transactionDelay: 200,
    eventDelay: 100,
    contractDelay: 150,
    blockDelay: 50,
    maxRetries: 3,
  }
});

// Add contracts to monitor
await indexar.addContract(
  "0x...", // Contract address
  "MyContract",
  contractABI
);

// Start indexing
await indexar.start();

// Listen for events
indexar.on("eventIndexed", (event) => {
  console.log("Event indexed:", event);
});

indexar.on("blockProcessed", (block) => {
  console.log("Block processed:", block);
});
```

## Database Schema

### Events Collection
```javascript
{
  contract_address: String,
  event_name: String,
  block_number: Number,
  transaction_hash: String,
  log_index: Number,
  args: Object,
  timestamp: Number
}
```

### Transactions Collection
```javascript
{
  hash: String,
  block_number: Number,
  from_address: String,
  to_address: String,
  value: String,
  gas_used: String,
  gas_price: String,
  timestamp: Number,
  status: Number
}
```

### Blocks Collection
```javascript
{
  number: Number,
  hash: String,
  timestamp: Number
}
```

## Error Handling

The indexer includes robust error handling with exponential backoff for rate limit errors (HTTP 429). When rate limits are hit, the system will:

1. Detect the 429 error
2. Wait with exponential backoff (2^retry * base_delay)
3. Retry the operation up to `maxRetries` times
4. Log detailed information about retry attempts

## Troubleshooting

### Rate Limit Errors (429)

If you're still getting rate limit errors despite the built-in rate limiting:

1. **Increase delays**: Try increasing the delay values in the rateLimits configuration
2. **Reduce batch size**: Lower the `batchSize` to process fewer blocks at once
3. **Upgrade your RPC provider**: Consider upgrading to a paid tier with higher rate limits
4. **Monitor logs**: Check the console output for retry attempts and adjust accordingly

### Performance Optimization

For better performance with high-volume contracts:

1. **Use appropriate delays**: Balance between speed and rate limits
2. **Monitor memory usage**: Large numbers of contracts can consume significant memory
3. **Database indexing**: Ensure proper indexes on frequently queried fields
4. **Batch processing**: Use the batch processing for historical data instead of real-time for large ranges

## License

MIT
