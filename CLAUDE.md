# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**gondifees** is a Next.js 14 application that tracks and visualizes fees collected by the GONDI protocol across Ethereum and HyperEVM networks. It provides real-time dashboards with interactive charts showing fee trends and currency distribution.

## Development Commands

### Essential Commands
- `npm run dev` - Start development server at http://localhost:3000
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run setup-api-key` - Helper script to set up Etherscan API key

### Testing and Monitoring
- `node test-api.js` - Test the fees API endpoint
- Visit `/api/health` - Check API health status

## Architecture Overview

### Core Structure
```
app/
├── api/fees/route.ts     # Main API endpoint - fetches and aggregates blockchain data
├── api/health/route.ts   # Health check endpoint
├── page.tsx             # Main dashboard UI with charts
└── layout.tsx           # App layout and global styles

lib/
├── blockchain.ts        # Blockchain API interactions (Etherscan/HyperEVMScan)
├── aggregate.ts         # Fee data aggregation logic
├── prices.ts           # Token price fetching and USD conversion
├── types.ts           # TypeScript type definitions
├── csv-parser.ts      # CSV data parsing for local dev
├── demo-data.ts       # Demo data generation
└── last-processed.ts  # Incremental update tracking
```

### Key Features
- **Multi-chain fee tracking**: Monitors Ethereum (`0x4169447a424ec645f8a24dccfd8328f714dd5562`) and HyperEVM (`0xbc0b9c63dc0581278d4b554af56858298bf2a9ec`) addresses
- **Real-time USD conversion**: Uses CoinGecko API for price data
- **Incremental updates**: Tracks last processed blocks to avoid full re-fetches
- **Flexible data sources**: API calls in production, CSV files for local development
- **Interactive visualizations**: Recharts for line charts and pie charts

### API Architecture
The `/api/fees` endpoint handles multiple data sources:
1. **CSV files** (local dev only): Looks for exported transaction CSVs
2. **Blockchain APIs**: Etherscan and HyperEVMScan APIs
3. **Demo data**: For testing and previews

### Environment Variables
- `ETHERSCAN_API_KEY` - Required for production API calls (free tier available)
- `ETHEREUM_CSV_PATH` - Optional: Custom path to Ethereum CSV data
- `HYPEREVM_CSV_PATH` - Optional: Custom path to HyperEVM CSV data

## Development Patterns

### Data Flow
1. Frontend requests data from `/api/fees`
2. API determines data source (CSV vs blockchain APIs)
3. Raw transactions are fetched and parsed
4. Token prices are fetched for USD conversion
5. Data is aggregated by time periods (daily/weekly/monthly)
6. Response includes aggregated data + recent transactions

### Error Handling
- Graceful fallbacks when one blockchain API fails
- Timeout protection for Vercel function limits
- Detailed error logging with environment context
- User-friendly error messages with hints

### Performance Considerations
- 60-second Vercel function timeout (configured in `vercel.json`)
- Incremental fetching to avoid re-processing all transactions
- API timeout management to prevent function timeouts
- CSV file fallback for faster local development

## TypeScript Configuration

Uses strict TypeScript with path aliases:
- `@/*` maps to project root for clean imports
- Target ES2020 for modern browser support
- Next.js plugin integration

## Deployment

### Vercel Setup
- Auto-deploys from GitHub
- Requires `ETHERSCAN_API_KEY` environment variable
- Function timeout set to 60 seconds in `vercel.json`

### Local Development with CSV Data
For faster development, place CSV exports in:
- `/Users/guimar/Downloads/export-address-token-0x4169447a424ec645f8a24dccfd8328f714dd5562.csv` (Ethereum)
- `/Users/guimar/Downloads/export-address-token-0xbc0b9c63dc0581278d4b554af56858298bf2a9ec.csv` (HyperEVM)

## Common Workflows

### Adding New Token Support
1. Update token parsing logic in `lib/blockchain.ts`
2. Add price fetching support in `lib/prices.ts`
3. Test with both CSV and API data sources

### Debugging Production Issues
1. Check Vercel function logs for API errors
2. Verify `ETHERSCAN_API_KEY` is set correctly
3. Monitor for timeout issues (function duration > 60s)
4. Check API rate limits and error responses

### Performance Optimization
1. Use incremental updates when possible (`?incremental=true`)
2. Consider CSV files for large historical datasets
3. Monitor function execution time in logs
4. Optimize aggregation logic for large transaction sets