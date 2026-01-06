import { Transaction } from './types';

// Contract addresses
const GONDI_CONTRACT = '0x4169447a424ec645f8a24dccfd8328f714dd5562';
const USDC_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WETH_CONTRACT = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

// Start date: October 22, 2025
const START_DATE = new Date('2025-10-22T00:00:00Z');
const START_TIMESTAMP = Math.floor(START_DATE.getTime() / 1000);

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

export function parseTransactionValue(value: string, decimals: number = 18): number {
  try {
    const bigIntValue = BigInt(value);
    const divisor = BigInt(10 ** decimals);
    const quotient = bigIntValue / divisor;
    const remainder = bigIntValue % divisor;
    return Number(quotient) + Number(remainder) / Number(divisor);
  } catch (error) {
    console.error('Error parsing transaction value:', error, { value, decimals });
    return 0;
  }
}

async function fetchWithRetry(url: string, retries: number = 3): Promise<any[]> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔗 API call (attempt ${i + 1}): ${url.substring(0, 100)}...`);
      
      const response = await fetch(url, { 
        headers: {
          'User-Agent': 'GONDI-FeeTracker/1.0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === '0') {
        if (data.message === 'No transactions found') {
          console.log('ℹ️ No transactions found for this request');
          return [];
        }
        throw new Error(`Etherscan API error: ${data.message || data.result}`);
      }
      
      const results = Array.isArray(data.result) ? data.result : [];
      console.log(`✅ Received ${results.length} results`);
      return results;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Attempt ${i + 1} failed:`, errorMsg);
      
      if (i === retries - 1) {
        console.error('❌ All retry attempts failed');
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return [];
}

export async function fetchEthereumTransactions(): Promise<Transaction[]> {
  try {
    const transactions: Transaction[] = [];
    
    console.log('🔍 Fetching transactions for GONDI contract:', GONDI_CONTRACT);
    console.log('📅 Date range: Oct 22, 2025 onwards');
    console.log('📅 Start timestamp filter:', START_TIMESTAMP, '(', new Date(START_TIMESTAMP * 1000).toISOString(), ')');
    
    if (!ETHERSCAN_API_KEY) {
      console.warn('⚠️ ETHERSCAN_API_KEY not set. API calls may fail.');
    }

    // Build URLs with start timestamp filter (using V2 API)
    const baseParams = `&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    
    // 1. ERC-20 Token transfers TO the contract (USDC + WETH)
    const tokenUrl = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&address=${GONDI_CONTRACT}${baseParams}`;
    
    // 2. Internal ETH transactions TO the contract  
    const internalUrl = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlistinternal&address=${GONDI_CONTRACT}${baseParams}`;
    
    // 3. Regular ETH transactions TO the contract
    const normalUrl = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${GONDI_CONTRACT}${baseParams}`;

    console.log('🔗 Starting parallel API calls...');
    
    // Fetch all three types in parallel
    const [tokenResults, internalResults, normalResults] = await Promise.allSettled([
      fetchWithRetry(tokenUrl),
      fetchWithRetry(internalUrl),
      fetchWithRetry(normalUrl)
    ]);

    // Process ERC-20 token transfers (USDC & WETH)
    if (tokenResults.status === 'fulfilled') {
      const tokens = tokenResults.value
        .filter(tx => {
          // Filter by date
          const txTimestamp = parseInt(tx.timeStamp);
          if (txTimestamp < START_TIMESTAMP) return false;
          
          // Must be TO the GONDI contract
          if (tx.to?.toLowerCase() !== GONDI_CONTRACT.toLowerCase()) return false;
          
          // Must have value
          if (!tx.value || BigInt(tx.value) <= 0) return false;
          
          // Must be USDC or WETH
          const contractAddress = tx.contractAddress?.toLowerCase();
          return contractAddress === USDC_CONTRACT.toLowerCase() || 
                 contractAddress === WETH_CONTRACT.toLowerCase();
        })
        .map(tx => ({
          hash: tx.hash,
          timestamp: parseInt(tx.timeStamp) * 1000,
          value: tx.value,
          tokenSymbol: tx.tokenSymbol === 'WETHEREUM' ? 'WETH' : tx.tokenSymbol,
          tokenDecimal: parseInt(tx.tokenDecimal || '18'),
          from: tx.from,
          to: tx.to,
          network: 'ethereum' as const,
          blockNumber: parseInt(tx.blockNumber),
        }));

      transactions.push(...tokens);
      console.log(`✅ Processed ${tokens.length} ERC-20 token transactions`);
    } else {
      console.error('❌ Token transactions failed:', tokenResults.reason);
    }

    // Process internal ETH transactions
    if (internalResults.status === 'fulfilled') {
      const ethInternal = internalResults.value
        .filter(tx => {
          // Filter by date
          const txTimestamp = parseInt(tx.timeStamp);
          if (txTimestamp < START_TIMESTAMP) return false;
          
          // Must be TO the GONDI contract
          if (tx.to?.toLowerCase() !== GONDI_CONTRACT.toLowerCase()) return false;
          
          // Must have ETH value
          return tx.value && BigInt(tx.value) > 0;
        })
        .map(tx => ({
          hash: tx.hash,
          timestamp: parseInt(tx.timeStamp) * 1000,
          value: tx.value,
          tokenSymbol: 'ETH',
          tokenDecimal: 18,
          from: tx.from,
          to: tx.to,
          network: 'ethereum' as const,
          blockNumber: parseInt(tx.blockNumber || '0'),
        }));

      transactions.push(...ethInternal);
      console.log(`✅ Processed ${ethInternal.length} internal ETH transactions`);
    } else {
      console.error('❌ Internal ETH transactions failed:', internalResults.reason);
    }

    // Process normal ETH transactions 
    if (normalResults.status === 'fulfilled') {
      const ethNormal = normalResults.value
        .filter(tx => {
          // Filter by date
          const txTimestamp = parseInt(tx.timeStamp);
          if (txTimestamp < START_TIMESTAMP) return false;
          
          // Must be TO the GONDI contract
          if (tx.to?.toLowerCase() !== GONDI_CONTRACT.toLowerCase()) return false;
          
          // Must have ETH value
          return tx.value && BigInt(tx.value) > 0;
        })
        .map(tx => ({
          hash: tx.hash,
          timestamp: parseInt(tx.timeStamp) * 1000,
          value: tx.value,
          tokenSymbol: 'ETH',
          tokenDecimal: 18,
          from: tx.from,
          to: tx.to,
          network: 'ethereum' as const,
          blockNumber: parseInt(tx.blockNumber),
        }));

      transactions.push(...ethNormal);
      console.log(`✅ Processed ${ethNormal.length} normal ETH transactions`);
    } else {
      console.error('❌ Normal ETH transactions failed:', normalResults.reason);
    }

    // Remove duplicates (same hash + same value)
    const uniqueTransactions = transactions.filter((tx, index, array) => {
      return array.findIndex(t => t.hash === tx.hash && t.value === tx.value) === index;
    });

    // Log summary
    const summary: Record<string, number> = {};
    uniqueTransactions.forEach(tx => {
      const symbol = tx.tokenSymbol || 'UNKNOWN';
      summary[symbol] = (summary[symbol] || 0) + 1;
    });

    console.log(`🎯 Final Summary: ${uniqueTransactions.length} unique transactions`);
    console.log('📊 By currency:', summary);
    
    return uniqueTransactions;

  } catch (error) {
    console.error('❌ Error fetching Ethereum transactions:', error);
    return [];
  }
}