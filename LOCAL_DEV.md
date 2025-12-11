# Local Development Guide

## Quick Start

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Set up API Key** (optional but recommended):
   ```bash
   # Create .env.local file
   echo "ETHERSCAN_API_KEY=your_key_here" > .env.local
   ```
   
   Or use the helper script:
   ```bash
   npm run setup-api-key
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Open in browser**:
   ```
   http://localhost:3000
   ```

## How Local Development Works

### Data Sources (in order of priority):

1. **CSV Files** (local development only):
   - The app will try to find CSV files in these locations:
     - `/Users/guimar/Downloads/export-address-token-0x4169447a424ec645f8a24dccfd8328f714dd5562.csv` (Ethereum)
     - `/Users/guimar/Downloads/export-address-token-0xbc0b9c63dc0581278d4b554af56858298bf2a9ec.csv` (HyperEVM)
     - `./data/ethereum-transactions.csv` (project root/data folder)
     - `./data/hyperevm-transactions.csv` (project root/data folder)
     - `./ethereum-transactions.csv` (project root)
     - `./hyperevm-transactions.csv` (project root)
   - You can also set custom paths via environment variables:
     ```bash
     ETHEREUM_CSV_PATH=/path/to/ethereum.csv
     HYPEREVM_CSV_PATH=/path/to/hyperevm.csv
     ```

2. **Etherscan API** (if CSV files not found or `forceApi=true`):
   - Requires `ETHERSCAN_API_KEY` in `.env.local`
   - Fetches real-time data from blockchain
   - Works for both Ethereum (chainid=1) and HyperEVM (chainid=999)

3. **Demo Data** (fallback):
   - If no API key and no CSV files, shows demo data
   - Access directly: `http://localhost:3000/api/fees?demo=true`

### API Endpoints

- **Main Page**: `http://localhost:3000`
- **Fees API**: `http://localhost:3000/api/fees`
- **Health Check**: `http://localhost:3000/api/health`
- **Force API**: `http://localhost:3000/api/fees?forceApi=true` (bypasses CSV, uses API)
- **Demo Mode**: `http://localhost:3000/api/fees?demo=true` (shows demo data)

### Troubleshooting

#### Server won't start
- Check if port 3000 is already in use: `lsof -i :3000`
- Kill existing process: `kill -9 $(lsof -t -i:3000)`
- Try a different port: `PORT=3001 npm run dev`

#### No data showing
1. Check if API key is set: `cat .env.local`
2. Check server logs for errors
3. Try accessing API directly: `curl http://localhost:3000/api/fees`
4. Check browser console for errors

#### CSV files not loading
- Verify file paths exist
- Check file permissions
- Look for error messages in server logs
- The app will automatically fall back to API if CSV files are not found

#### API errors
- Verify `ETHERSCAN_API_KEY` is correct in `.env.local`
- Check API key status at: https://etherscan.io/myapikey
- Restart server after changing `.env.local`

### Development Features

- **Hot Reload**: Changes to code automatically refresh the browser
- **Detailed Logging**: Check terminal for detailed transaction and fee calculation logs
- **Error Messages**: Clear error messages in both UI and console
- **Cache Support**: Data is cached in browser localStorage for faster loading

### Testing

Test the API endpoints:
```bash
# Health check
curl http://localhost:3000/api/health

# Get fees (uses CSV if available, otherwise API)
curl http://localhost:3000/api/fees

# Force API usage
curl "http://localhost:3000/api/fees?forceApi=true"

# Demo data
curl "http://localhost:3000/api/fees?demo=true"
```

### Environment Variables

Create `.env.local` file:
```bash
# Required for API access
ETHERSCAN_API_KEY=your_api_key_here

# Optional: Custom CSV paths
ETHEREUM_CSV_PATH=/custom/path/to/ethereum.csv
HYPEREVM_CSV_PATH=/custom/path/to/hyperevm.csv
```

### Contract Addresses

The app monitors these addresses:
- **Ethereum**: `0x4169447a424ec645f8a24dccfd8328f714dd5562` (Chain ID: 1)
- **HyperEVM**: `0xbc0b9c63dc0581278d4b554af56858298bf2a9ec` (Chain ID: 999)

These are configured in `lib/blockchain.ts` and can be modified if needed.
