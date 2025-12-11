import { Transaction, FeeData } from './types';

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const ETHEREUM_ADDRESS = '0x4169447a424ec645f8a24dccfd8328f714dd5562';
const HYPEREVM_ADDRESS = '0xbc0b9c63dc0581278d4b554af56858298bf2a9ec';

interface EtherscanResponse {
  status: string;
  message: string;
  result: Array<{
    blockNumber: string;
    timeStamp: string;
    hash: string;
    from: string;
    to: string;
    value: string;
    tokenName?: string;
    tokenSymbol?: string;
    tokenDecimal?: string;
    contractAddress?: string;
  }>;
}

interface HyperEVMResponse {
  status: string;
  message: string;
  result: Array<{
    blockNumber: string;
    timeStamp: string;
    hash: string;
    from: string;
    to: string;
    value: string;
    tokenName?: string;
    tokenSymbol?: string;
    tokenDecimal?: string;
    contractAddress?: string;
  }>;
}

// Etherscan API returns up to 10,000 results per call
// We need to handle the case where there might be more results
async function fetchWithRetry(url: string, retries: number = 3): Promise<any[]> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching from API (attempt ${i + 1}/${retries})...`);
      // Create timeout controller for better compatibility
      // Vercel Hobby plan has 10s timeout, Pro has 60s
      // Ethereum has many more transactions, so we need more time
      // Use 25s for Vercel (safe margin under 30s function limit) or 60s locally
      const timeoutMs = process.env.VERCEL === '1' ? 25000 : 60000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`⏱️ Request timeout after ${timeoutMs}ms`);
        controller.abort();
      }, timeoutMs);
      
      const response = await fetch(url, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error(`API returned status ${response.status}: ${response.statusText}`);
        if (i === retries - 1) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        continue;
      }
      
      const data: any = await response.json();
      console.log(`API response - Status: ${data.status}, Message: ${data.message}, Result type: ${typeof data.result}, Result length: ${Array.isArray(data.result) ? data.result.length : 'N/A'}`);
      
      if (data.status === '1' && Array.isArray(data.result)) {
        const results = data.result;
        console.log(`✅ API returned ${results.length} results`);
        
        // If we got exactly 10,000 results, we might be missing some
        // But for now, return what we have
        if (results.length === 10000) {
          console.warn('WARNING: Got exactly 10,000 results - might be missing some transactions. Consider splitting by block ranges.');
        }
        
        return results;
      } else if (data.status === '0' && data.message) {
        console.log(`⚠️ API response: ${data.message}`);
        // If it's a deprecation warning but we have results, still return them
        if (data.result && Array.isArray(data.result) && data.result.length > 0) {
          console.log('✅ Got results despite deprecation warning');
          return data.result;
        }
        // Check if result is a string (deprecation message)
        if (typeof data.result === 'string' && data.result.includes('deprecated')) {
          console.error('❌ API endpoint is deprecated. Please update to V2 API.');
        }
        console.log('⚠️ No results returned from API');
        return [];
      } else {
        console.warn(`⚠️ Unexpected API response format:`, { status: data.status, message: data.message, hasResult: !!data.result });
        return [];
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Attempt ${i + 1} failed:`, errorMsg);
      if (i === retries - 1) {
        console.error('❌ All retry attempts failed');
        throw error;
      }
      // Wait before retry
      console.log(`⏳ Waiting ${1000 * (i + 1)}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return [];
}

export async function fetchEthereumTransactions(): Promise<Transaction[]> {
  try {
    const transactions: Transaction[] = [];
    
    // Check if API key is available
    if (!ETHERSCAN_API_KEY) {
      console.warn('ETHERSCAN_API_KEY not set. API calls may be rate-limited.');
    }
    
    // ONLY fetch USDC and WETH token transfers (no native ETH, no DAI, no USDT)
    // Using Etherscan API V2 (V1 deprecated as of Aug 2025)
    const tokenUrl = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&address=${ETHEREUM_ADDRESS}&startblock=0&endblock=99999999&sort=asc${ETHERSCAN_API_KEY ? `&apikey=${ETHERSCAN_API_KEY}` : ''}`;
    
    let tokenResults: any[] = [];
    try {
      console.log('Starting Ethereum API fetch...');
      const startTime = Date.now();
      tokenResults = await fetchWithRetry(tokenUrl);
      const duration = Date.now() - startTime;
      console.log(`✅ Ethereum API fetch completed in ${duration}ms, got ${tokenResults.length} results`);
    } catch (fetchError) {
      const errorMsg = `Failed to fetch Ethereum transactions: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
      console.error('❌ Ethereum fetch error:', errorMsg);
      console.error('Error type:', fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError);
      if (errorMsg.includes('timeout') || errorMsg.includes('aborted')) {
        console.error('⚠️ TIMEOUT DETECTED: Ethereum API request timed out. This is likely due to large number of transactions.');
        console.error('💡 Solution: Increase Vercel function timeout or implement pagination.');
      }
      if (!ETHERSCAN_API_KEY) {
        throw new Error('ETHERSCAN_API_KEY environment variable is required. Please set it in Vercel environment variables.');
      }
      throw new Error(errorMsg);
    }
    
    if (tokenResults.length > 0) {
      const tokenTxs = tokenResults
        .filter(tx => {
          // Only include transactions TO the fee address
          const isToFeeAddress = tx.to && tx.to.toLowerCase() === ETHEREUM_ADDRESS.toLowerCase();
          // ONLY USDC and WETH - filter out everything else
          const tokenSymbol = (tx.tokenSymbol || '').toUpperCase();
          const isUSDC = tokenSymbol === 'USDC';
          const isWETH = tokenSymbol === 'WETH' || tokenSymbol === 'WETHEREUM';
          const isValidToken = isUSDC || isWETH;
          
          return isToFeeAddress && isValidToken && tx.value && BigInt(tx.value) > BigInt(0);
        })
        .map(tx => {
          // Normalize WETH symbol
          let tokenSymbol = (tx.tokenSymbol || '').toUpperCase();
          if (tokenSymbol === 'WETHEREUM') {
            tokenSymbol = 'WETH';
          }
          
          return {
            hash: tx.hash,
            timestamp: parseInt(tx.timeStamp) * 1000,
            value: tx.value,
            tokenSymbol: tokenSymbol,
            tokenDecimal: tx.tokenDecimal ? parseInt(tx.tokenDecimal) : (tokenSymbol === 'USDC' ? 6 : 18),
            from: tx.from,
            to: tx.to,
            network: 'ethereum' as const,
          };
        });
      
      transactions.push(...tokenTxs);
      console.log(`Fetched ${tokenTxs.length} USDC/WETH transactions TO fee address (out of ${tokenResults.length} total token transactions)`);
      
      // Log breakdown by token with amounts
      const tokenBreakdown: { [key: string]: { count: number; totalValue: bigint; decimals: number } } = {};
      tokenTxs.forEach(tx => {
        const symbol = tx.tokenSymbol || 'UNKNOWN';
        if (!tokenBreakdown[symbol]) {
          tokenBreakdown[symbol] = { count: 0, totalValue: BigInt(0), decimals: tx.tokenDecimal || 18 };
        }
        tokenBreakdown[symbol].count++;
        tokenBreakdown[symbol].totalValue += BigInt(tx.value);
      });
      
      console.log('Fee token breakdown:');
      Object.entries(tokenBreakdown).forEach(([symbol, data]) => {
        const total = Number(data.totalValue) / (10 ** data.decimals);
        console.log(`  ${symbol}: ${data.count} transactions, ${total.toFixed(6)} tokens`);
      });
    } else {
      console.log('No token transactions found. API response may be empty or error.');
    }
    
    return transactions;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error fetching Ethereum transactions:', errorMsg);
    console.error('Full error details:', {
      message: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
      hasApiKey: !!ETHERSCAN_API_KEY
    });
    // Return empty array to allow partial success (HyperEVM might still work)
    return [];
  }
}

export async function fetchHyperEVMTransactions(): Promise<Transaction[]> {
  try {
    const transactions: Transaction[] = [];
    
    // Check if API key is available
    if (!ETHERSCAN_API_KEY) {
      console.warn('ETHERSCAN_API_KEY not set. API calls may be rate-limited.');
    }
    
    // Fetch ERC-20 token transfers - focus on USDC (HUSDC) and WHYPE
    // Using Etherscan API V2 with chainid=999 for HyperEVM
    const tokenUrl = `https://api.etherscan.io/v2/api?chainid=999&module=account&action=tokentx&address=${HYPEREVM_ADDRESS}&startblock=0&endblock=99999999&sort=asc${ETHERSCAN_API_KEY ? `&apikey=${ETHERSCAN_API_KEY}` : ''}`;
    
    let tokenResults: any[] = [];
    try {
      tokenResults = await fetchWithRetry(tokenUrl);
    } catch (fetchError) {
      const errorMsg = `Failed to fetch HyperEVM transactions: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
      console.error(errorMsg);
      if (!ETHERSCAN_API_KEY) {
        throw new Error('ETHERSCAN_API_KEY environment variable is required. Please set it in Vercel environment variables.');
      }
      throw new Error(errorMsg);
    }
    
    if (tokenResults.length > 0) {
      const tokenTxs = tokenResults
        .filter(tx => {
          const isToFeeAddress = tx.to && tx.to.toLowerCase() === HYPEREVM_ADDRESS.toLowerCase();
          const tokenSymbol = (tx.tokenSymbol || '').toUpperCase();
          const tokenName = (tx.tokenName || '').toUpperCase();
          // Only USDC (will be tagged as HUSDC) and WHYPE/Wrapped HYPE
          const isUSDC = tokenSymbol === 'USDC';
          const isWHYPE = tokenSymbol === 'WHYPE' || tokenSymbol === 'WRHYPER' || 
                         tokenName.includes('WRAP') || tokenName.includes('HYPE');
          const isValidToken = isUSDC || isWHYPE;
          
          return isToFeeAddress && isValidToken && tx.value && BigInt(tx.value) > BigInt(0);
        })
        .map(tx => {
          // Tag USDC as HUSDC, keep WHYPE as WHYPE
          let tokenSymbol = (tx.tokenSymbol || '').toUpperCase();
          if (tokenSymbol === 'USDC') {
            tokenSymbol = 'HUSDC'; // Tag HyperEVM USDC as HUSDC
          } else if (tokenSymbol === 'WRHYPER' || (tx.tokenName || '').toUpperCase().includes('WRAP')) {
            tokenSymbol = 'WHYPE';
          }
          
          return {
            hash: tx.hash,
            timestamp: parseInt(tx.timeStamp) * 1000,
            value: tx.value,
            tokenSymbol: tokenSymbol,
            tokenDecimal: tx.tokenDecimal ? parseInt(tx.tokenDecimal) : (tokenSymbol === 'HUSDC' ? 6 : 18),
            from: tx.from,
            to: tx.to,
            network: 'hyperevm' as const,
          };
        });
      
      transactions.push(...tokenTxs);
      console.log(`Fetched ${tokenTxs.length} relevant token transactions TO fee address from HyperEVM (out of ${tokenResults.length} total token transactions)`);
      
      // Log breakdown by token
      const tokenBreakdown: { [key: string]: { count: number; totalValue: bigint } } = {};
      tokenTxs.forEach(tx => {
        const symbol = tx.tokenSymbol || 'UNKNOWN';
        if (!tokenBreakdown[symbol]) {
          tokenBreakdown[symbol] = { count: 0, totalValue: BigInt(0) };
        }
        tokenBreakdown[symbol].count++;
        tokenBreakdown[symbol].totalValue += BigInt(tx.value);
      });
      
      console.log('HyperEVM Token breakdown:');
      Object.entries(tokenBreakdown).forEach(([symbol, data]) => {
        const decimals = tokenTxs.find(tx => tx.tokenSymbol === symbol)?.tokenDecimal || 18;
        const total = Number(data.totalValue) / (10 ** decimals);
        console.log(`  ${symbol}: ${data.count} transactions, ${total.toFixed(6)} tokens`);
      });
    } else {
      console.log('No token transactions found for HyperEVM. API response may be empty or error.');
    }
    
    return transactions;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error fetching HyperEVM transactions:', errorMsg);
    console.error('Full error details:', {
      message: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
      hasApiKey: !!ETHERSCAN_API_KEY
    });
    // Return empty array to allow partial success (Ethereum might still work)
    return [];
  }
}

export function parseTransactionValue(value: string, decimals: number = 18): number {
  const bigIntValue = BigInt(value);
  const divisor = BigInt(10 ** decimals);
  const wholePart = bigIntValue / divisor;
  const fractionalPart = Number(bigIntValue % divisor) / Number(divisor);
  return Number(wholePart) + fractionalPart;
}

