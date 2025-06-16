# Indexar

A blockchain indexing service that uses PostgreSQL for data storage.

## Prerequisites

- [Bun](https://bun.sh/) - JavaScript runtime and package manager
- [PostgreSQL](https://www.postgresql.org/) - Database server
- Node.js (for development)

## Setup

1. Install dependencies:
```bash
bun install
```

2. Set up PostgreSQL:
   - Install PostgreSQL if you haven't already
   - Create a new database:
     ```sql
     CREATE DATABASE indexar;
     ```
   - Create a user (optional, you can use the default postgres user):
     ```sql
     CREATE USER indexar WITH PASSWORD 'your_password';
     GRANT ALL PRIVILEGES ON DATABASE indexar TO indexar;
     ```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Update the following variables in `.env`:
     - `RPC_URL`: Your Ethereum node RPC URL
     - `POSTGRES_USER`: PostgreSQL username
     - `POSTGRES_PASSWORD`: PostgreSQL password
     - `POSTGRES_DB`: Database name (default: indexar)
     - `POSTGRES_HOST`: Database host (default: localhost)
     - `POSTGRES_PORT`: Database port (default: 5432)

4. Start the service:
```bash
bun start
```

5. Start the API server:
```bash
bun api
```

## Features

- Indexes Ethereum blockchain data
- Stores blocks, transactions, and events
- GraphQL API for querying indexed data
- Real-time event monitoring
- PostgreSQL for robust data storage

## API

The service provides a GraphQL API at `http://localhost:4000`. You can use the GraphQL playground to explore the available queries and mutations.

## Development

- The project uses TypeScript for type safety
- PostgreSQL is used for data persistence
- Bun is used as the package manager and runtime
- Apollo Server is used for the GraphQL API

## License

MIT
