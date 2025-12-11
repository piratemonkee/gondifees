import { Transaction } from './types';

/**
 * Generate demo data for testing the dashboard
 * This allows users to see how the app works while they set up their API key
 */
export function generateDemoData(): Transaction[] {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const transactions: Transaction[] = [];
  
  // Generate transactions for the last 30 days
  for (let i = 0; i < 30; i++) {
    const date = new Date(now - (i * oneDay));
    const dayOfWeek = date.getDay();
    
    // More transactions on weekdays
    const txCount = dayOfWeek >= 1 && dayOfWeek <= 5 ? Math.floor(Math.random() * 5) + 2 : Math.floor(Math.random() * 3) + 1;
    
    for (let j = 0; j < txCount; j++) {
      const timestamp = date.getTime() + (j * 3600000); // Spread throughout the day
      const isEthereum = i % 2 === 0;
      // Only use actual currencies: USDC/WETH for Ethereum, HUSDC/WHYPE for HyperEVM
      const currencies = isEthereum ? ['USDC', 'WETH'] : ['HUSDC', 'WHYPE'];
      const currency = currencies[Math.floor(Math.random() * currencies.length)];
      const decimals = currency === 'WETH' || currency === 'WHYPE' ? 18 : 6;
      
      // Generate realistic fee amounts
      let value: bigint;
      if (currency === 'WETH') {
        // WETH fees: 0.001 to 0.1 WETH
        const ethAmount = Math.random() * 0.099 + 0.001;
        value = BigInt(Math.floor(ethAmount * 10 ** 18));
      } else if (currency === 'WHYPE') {
        // WHYPE fees: 0.1 to 10 WHYPE
        const whypeAmount = Math.random() * 9.9 + 0.1;
        value = BigInt(Math.floor(whypeAmount * 10 ** 18));
      } else {
        // USDC/HUSDC fees: 10 to 1000 tokens
        const tokenAmount = Math.random() * 990 + 10;
        value = BigInt(Math.floor(tokenAmount * 10 ** decimals));
      }
      
      transactions.push({
        hash: `0x${Math.random().toString(16).substring(2, 66)}`,
        timestamp,
        value: value.toString(),
        tokenSymbol: currency,
        tokenDecimal: decimals,
        from: `0x${Math.random().toString(16).substring(2, 42)}`,
        to: isEthereum ? '0x4169447a424ec645f8a24dccfd8328f714dd5562' : '0xbc0b9c63dc0581278d4b554af56858298bf2a9ec',
        network: isEthereum ? 'ethereum' : 'hyperevm',
      });
    }
  }
  
  return transactions.sort((a, b) => a.timestamp - b.timestamp);
}

