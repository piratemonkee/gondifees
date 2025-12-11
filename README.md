# gondifees

# GONDI Protocol Fees Dashboard

A Next.js application that tracks and visualizes fees collected by the GONDI protocol across Ethereum and HyperEVM networks.

## Features

- **Daily, Weekly, and Monthly Aggregation**: View fee totals broken down by time periods
- **Currency Breakdown**: See the percentage distribution of fees across different currencies
- **Interactive Charts**: Visualize fee trends with line charts and currency distribution with pie charts
- **Multi-Chain Support**: Fetches data from both Ethereum and HyperEVM networks

## Setup

1. Install dependencies:
```bash
npm install
```

2. (Optional) Set up Etherscan API key for better rate limits:
```bash
# Create a .env.local file
echo "ETHERSCAN_API_KEY=your_api_key_here" > .env.local
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Configuration

The application monitors these addresses:
- **Ethereum**: `0x4169447a424ec645f8a24dccfd8328f714dd5562`
- **HyperEVM**: `0xbc0b9c63dc0581278d4b554af56858298bf2a9ec`

### API Endpoints Used

- **Etherscan API**: Fetches both native ETH transfers and ERC-20 token transfers
  - Native transfers: `txlist` action
  - Token transfers: `tokentx` action
- **HyperEVMScan API**: Similar structure to Etherscan for HyperEVM network

**Note**: The application fetches all incoming transactions to the fee collection addresses. Make sure you have an Etherscan API key set up in `.env.local` for better rate limits (free tier available).

## API Endpoints

- `GET /api/fees` - Fetches and aggregates fee data from both networks

## Technologies

- Next.js 14
- React 18
- TypeScript
- Recharts for data visualization
- date-fns for date manipulation

