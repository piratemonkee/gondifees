# Setup Instructions

## Quick Start

1. **Get a Free Etherscan API Key** (Required)
   - Go to https://etherscan.io/register
   - Create a free account
   - Navigate to https://etherscan.io/myapikey
   - Click "Add" to create a new API key
   - Copy your API key

2. **Configure Environment Variables**
   - Open `.env.local` in the project root
   - Add your API key:
     ```
     ETHERSCAN_API_KEY=your_api_key_here
     ```
   - Save the file

3. **Restart the Development Server**
   - Stop the current server (Ctrl+C)
   - Run `npm run dev` again
   - The app will now fetch real data from the blockchain

## Why an API Key is Needed

Etherscan has deprecated their V1 API endpoints. The V2 API requires an API key, but it's completely free to get one. The free tier provides:
- 5 calls per second
- 100,000 calls per day

This is more than sufficient for this dashboard application.

## Troubleshooting

- **No data showing**: Make sure you've added your API key to `.env.local` and restarted the server
- **API rate limit errors**: The free tier should be sufficient, but if you hit limits, wait a moment and try again
- **Empty results**: The addresses might not have transactions yet, or the API might be temporarily unavailable

## Testing Without API Key

The app will run without an API key, but it won't be able to fetch transaction data from Etherscan. You'll see a message indicating that no data was found.

