# Quick Start Guide

## ✅ App is Now Running!

Your GONDI Protocol Fees Dashboard is live at **http://localhost:3000**

### Current Status

The app is currently showing **demo data** so you can see how it works. The dashboard displays:
- ✅ Daily, weekly, and monthly fee totals
- ✅ Currency breakdown with percentages
- ✅ Interactive charts and visualizations
- ✅ Multi-chain support (Ethereum + HyperEVM)

### To Get Real Blockchain Data

1. **Get a Free Etherscan API Key** (takes 2 minutes):
   ```bash
   npm run setup-api-key
   ```
   This will guide you through the process and open the API key page in your browser.

   Or manually:
   - Visit: https://etherscan.io/myapikey
   - Sign up/login (free)
   - Click "Add" to create API key
   - Copy the key

2. **Add API Key to .env.local**:
   ```bash
   echo "ETHERSCAN_API_KEY=your_key_here" > .env.local
   ```

3. **Restart Server**:
   - Press `Ctrl+C` to stop
   - Run `npm run dev` again
   - Refresh browser

### Features

- **Automatic Demo Mode**: Shows sample data when no API key is configured
- **Real-time Data**: Fetches actual blockchain transactions when API key is added
- **Multi-Currency Support**: Tracks ETH, USDC, USDT, DAI, WETH, and more
- **Time-based Analysis**: View fees by day, week, or month
- **Visual Analytics**: Charts and graphs for easy understanding

### Troubleshooting

- **Still seeing demo data?** Make sure you've added the API key and restarted the server
- **No data showing?** Check that the addresses have received transactions
- **API errors?** Verify your API key is correct in `.env.local`

### Next Steps

1. Open http://localhost:3000 in your browser
2. Explore the dashboard with demo data
3. Get your API key to see real data
4. Customize the addresses if needed (edit `lib/blockchain.ts`)

Enjoy your dashboard! 🚀

