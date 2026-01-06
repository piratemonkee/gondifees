import { Transaction } from './types';

/**
 * Generate demo data for testing the dashboard
 * This allows users to see how the app works while they set up their API key
 */
export function generateDemoData(): Transaction[] {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const transactions: Transaction[] = [];
  
  // Generate transactions for the last 30 days with loan/sales classification
  for (let i = 0; i < 30; i++) {
    const date = new Date(now - (i * oneDay));
    const dayOfWeek = date.getDay();
    
    // More transactions on weekdays
    const txCount = dayOfWeek >= 1 && dayOfWeek <= 5 ? Math.floor(Math.random() * 5) + 2 : Math.floor(Math.random() * 3) + 1;
    
    for (let j = 0; j < txCount; j++) {
      const timestamp = date.getTime() + (j * 3600000); // Spread throughout the day
      const isEthereum = i % 2 === 0;
      
      // 30% chance it's a loan transaction, 70% sales (more realistic distribution)
      const isLoanTransaction = Math.random() < 0.3;
      const isInternalETH = !isLoanTransaction && Math.random() < 0.15; // 15% of sales are internal ETH
      
      // Only use actual currencies: USDC/WETH for Ethereum, HUSDC/WHYPE for HyperEVM
      const currencies = isEthereum ? ['USDC', 'WETH'] : ['HUSDC', 'WHYPE'];
      let currency = currencies[Math.floor(Math.random() * currencies.length)];
      
      // For internal ETH, always use ETH on Ethereum
      if (isInternalETH && isEthereum) {
        currency = 'ETH';
      }
      
      const decimals = currency === 'WETH' || currency === 'WHYPE' || currency === 'ETH' ? 18 : 6;
      
      // Generate method based on transaction type
      let method: string | undefined;
      if (isLoanTransaction) {
        const loanMethods = ['emit loan', 'repay loan', 'refinance full', 'smart migrate'];
        method = loanMethods[Math.floor(Math.random() * loanMethods.length)];
      } else {
        const salesMethods = ['buy', 'sell', 'execute sell'];
        method = salesMethods[Math.floor(Math.random() * salesMethods.length)];
      }
      
      // Generate realistic fee amounts based on transaction type
      let value: bigint;
      if (currency === 'WETH' || currency === 'ETH') {
        if (isLoanTransaction) {
          // Loan WETH fees: 0.1 to 2 ETH
          const ethAmount = Math.random() * 1.9 + 0.1;
          value = BigInt(Math.floor(ethAmount * 10 ** 18));
        } else {
          // Sales WETH fees: 0.001 to 0.1 ETH
          const ethAmount = Math.random() * 0.099 + 0.001;
          value = BigInt(Math.floor(ethAmount * 10 ** 18));
        }
      } else if (currency === 'WHYPE') {
        if (isLoanTransaction) {
          // Loan WHYPE fees: 5 to 50 WHYPE
          const whypeAmount = Math.random() * 45 + 5;
          value = BigInt(Math.floor(whypeAmount * 10 ** 18));
        } else {
          // Sales WHYPE fees: 0.1 to 5 WHYPE
          const whypeAmount = Math.random() * 4.9 + 0.1;
          value = BigInt(Math.floor(whypeAmount * 10 ** 18));
        }
      } else {
        // USDC/HUSDC
        if (isLoanTransaction) {
          // Loan USDC fees: 200 to 5000 tokens
          const tokenAmount = Math.random() * 4800 + 200;
          value = BigInt(Math.floor(tokenAmount * 10 ** decimals));
        } else {
          // Sales USDC fees: 10 to 500 tokens
          const tokenAmount = Math.random() * 490 + 10;
          value = BigInt(Math.floor(tokenAmount * 10 ** decimals));
        }
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
        method,
        isInternalETH,
      });
    }
  }
  
  return transactions.sort((a, b) => a.timestamp - b.timestamp);
}

