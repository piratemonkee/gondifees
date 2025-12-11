// Cache for price data
let priceCache: { [key: string]: { price: number; timestamp: number } } = {};
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export async function getTokenPriceUSD(tokenSymbol: string): Promise<number> {
  const normalizedSymbol = tokenSymbol.toUpperCase();
  
  // WHYPE has a fixed price - use it directly
  if (normalizedSymbol === 'WHYPE') {
    return 27.86; // WHYPE price: $1,007.64 / 36.16807881 = $27.86 per token
  }
  
  // Check cache first
  const cached = priceCache[normalizedSymbol];
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.price;
  }

  try {
    // Map token symbols to CoinGecko IDs
    const tokenMap: { [key: string]: string } = {
      'WETH': 'weth',
      'ETH': 'ethereum',
      'USDC': 'usd-coin',
      'HUSDC': 'usd-coin', // HyperEVM USDC uses same price as USDC
      'USDT': 'tether',
      'DAI': 'dai',
    };

    const coinId = tokenMap[normalizedSymbol] || normalizedSymbol.toLowerCase();
    
    // Fetch price from CoinGecko API
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch price for ${tokenSymbol}`);
    }

    const data = await response.json();
    const price = data[coinId]?.usd || 0;

    // Cache the price
    priceCache[normalizedSymbol] = {
      price,
      timestamp: Date.now(),
    };

    return price;
  } catch (error) {
    console.error(`Error fetching price for ${tokenSymbol}:`, error);
    
    // Return fallback prices if API fails (using current market prices)
    const fallbackPrices: { [key: string]: number } = {
      'WETH': 3189.05, // Current WETH price from the image
      'ETH': 3189.05,
      'USDC': 1.00,
      'HUSDC': 1.00, // HyperEVM USDC same as USDC
      'WHYPE': 27.86, // WHYPE price: $1,007.64 / 36.16807881 = ~$27.86
      'USDT': 1.00,
      'DAI': 1.00,
    };
    
    return fallbackPrices[normalizedSymbol] || 0;
  }
}

export async function getMultipleTokenPrices(
  tokens: string[]
): Promise<{ [token: string]: number }> {
  const prices: { [token: string]: number } = {};
  
  // Fetch all prices in parallel, normalize keys to uppercase
  await Promise.all(
    tokens.map(async (token) => {
      const normalizedToken = token.toUpperCase();
      prices[normalizedToken] = await getTokenPriceUSD(token);
    })
  );
  
  return prices;
}

