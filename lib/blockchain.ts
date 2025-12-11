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
async function fetchWithRetry(url: string, retries: number = 3, timeoutMs?: number): Promise<any[]> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching from API (attempt ${i + 1}/${retries})...`);
      // Create timeout controller for better compatibility
      // Use provided timeout or default: 15s for Vercel, 30s locally
      const requestTimeout = timeoutMs || (process.env.VERCEL === '1' ? 15000 : 30000);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`⏱️ Request timeout after ${requestTimeout}ms`);
        controller.abort();
      }, requestTimeout);
      
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

// Fetch transactions with pagination by block ranges
// Etherscan API returns max 10,000 results, so we split by block ranges
async function fetchTransactionsPaginated(
  baseUrl: string,
  startBlock: number = 0,
  endBlock: number = 99999999,
  network: 'ethereum' | 'hyperevm' = 'ethereum'
): Promise<any[]> {
  const allResults: any[] = [];
  // Use smaller block ranges for Ethereum (more transactions) to avoid timeouts
  // HyperEVM can use larger ranges since it has fewer transactions
  const BLOCK_RANGE = network === 'ethereum' ? 100000 : 500000; // 100k for Ethereum, 500k for HyperEVM
  const MAX_RESULTS = 10000;
  const MAX_EMPTY_RANGES = network === 'ethereum' ? 50 : 10; // Allow more empty ranges for Ethereum
  
  console.log(`📄 Starting paginated fetch for ${network}: blocks ${startBlock} to ${endBlock} (range: ${BLOCK_RANGE})`);
  
  let currentStart = startBlock;
  let attempt = 0;
  let consecutiveEmptyRanges = 0;
  const maxAttempts = Math.ceil((endBlock - startBlock) / BLOCK_RANGE) + 100; // Safety limit
  
  while (currentStart <= endBlock && attempt < maxAttempts) {
    attempt++;
    const currentEnd = Math.min(currentStart + BLOCK_RANGE - 1, endBlock);
    
    const paginatedUrl = `${baseUrl}&startblock=${currentStart}&endblock=${currentEnd}`;
    console.log(`📄 Fetching ${network} blocks ${currentStart} to ${currentEnd} (attempt ${attempt})...`);
    
    try {
      const results = await fetchWithRetry(paginatedUrl, 2, 10000); // 10s timeout per request
      
      if (results.length > 0) {
        allResults.push(...results);
        consecutiveEmptyRanges = 0; // Reset counter when we get results
        console.log(`✅ Got ${results.length} results from blocks ${currentStart}-${currentEnd} (total: ${allResults.length})`);
      } else {
        consecutiveEmptyRanges++;
        console.log(`📄 No results in blocks ${currentStart}-${currentEnd} (${consecutiveEmptyRanges} empty ranges in a row)`);
      }
      
      // If we got exactly MAX_RESULTS, we might be missing some, so continue
      if (results.length === MAX_RESULTS) {
        console.log(`⚠️ Got exactly ${MAX_RESULTS} results - might be missing some, continuing...`);
        currentStart = currentEnd + 1;
      } else if (results.length > 0 && results.length < MAX_RESULTS) {
        // Got some results but less than max - continue to check next range
        console.log(`📄 Got ${results.length} results (less than ${MAX_RESULTS}), continuing...`);
        currentStart = currentEnd + 1;
      } else {
        // Got 0 results
        // If we have results and hit many empty ranges, we're probably done
        if (allResults.length > 0 && consecutiveEmptyRanges >= MAX_EMPTY_RANGES) {
          console.log(`📄 Hit ${consecutiveEmptyRanges} consecutive empty ranges with ${allResults.length} results. Stopping.`);
          break;
        }
        // Otherwise continue searching
        currentStart = currentEnd + 1;
      }
      
      // Small delay to avoid rate limiting
      if (currentStart <= endBlock) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error fetching blocks ${currentStart}-${currentEnd}:`, errorMsg);
      
      // If we have some results, continue with next range
      // Otherwise, this might be a critical error
      if (allResults.length === 0 && attempt === 1) {
        throw error; // First attempt failed, throw error
      }
      
      // Skip this range and continue
      console.log(`⚠️ Skipping block range ${currentStart}-${currentEnd} due to error`);
      currentStart = currentEnd + 1;
    }
  }
  
  console.log(`✅ Paginated fetch complete for ${network}: ${allResults.length} total results`);
  return allResults;
}

export async function fetchEthereumTransactions(startBlock?: number): Promise<Transaction[]> {
  try {
    const transactions: Transaction[] = [];
    
    // Log the contract address being used for Ethereum
    console.log('🔍 ETHEREUM NETWORK - Using contract address:', ETHEREUM_ADDRESS);
    console.log('🔍 ETHEREUM NETWORK - Chain ID: 1 (Ethereum Mainnet)');
    
    // Check if API key is available
    if (!ETHERSCAN_API_KEY) {
      console.warn('ETHERSCAN_API_KEY not set. API calls may be rate-limited.');
    }
    
    // ONLY fetch USDC and WETH token transfers (no native ETH, no DAI, no USDT)
    // Using Etherscan API V2 (V1 deprecated as of Aug 2025)
    // Use pagination to handle large number of transactions
    const baseUrl = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&address=${ETHEREUM_ADDRESS}&sort=asc${ETHERSCAN_API_KEY ? `&apikey=${ETHERSCAN_API_KEY}` : ''}`;
    
    console.log('🔗 Ethereum API URL (base):', baseUrl.replace(ETHERSCAN_API_KEY || '', 'API_KEY_HIDDEN'));
    
    let tokenResults: any[] = [];
    try {
      console.log('Starting Ethereum API fetch with pagination...');
      const startTime = Date.now();
      
      // Fetch with pagination by block ranges
      // If startBlock is provided, only fetch from that block onwards (incremental update)
      const fetchStartBlock = startBlock !== undefined ? startBlock : 0;
      console.log(`📊 Fetching Ethereum transactions from block ${fetchStartBlock} onwards`);
      tokenResults = await fetchTransactionsPaginated(baseUrl, fetchStartBlock, 99999999, 'ethereum');
      
      const duration = Date.now() - startTime;
      console.log(`✅ Ethereum API fetch completed in ${duration}ms, got ${tokenResults.length} total results`);
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
      console.log(`📊 Processing ${tokenResults.length} raw token transactions from Ethereum API...`);
      
      const tokenTxs = tokenResults
        .filter(tx => {
          // Only include transactions TO the fee address
          const isToFeeAddress = tx.to && tx.to.toLowerCase() === ETHEREUM_ADDRESS.toLowerCase();
          // ONLY USDC and WETH - filter out everything else
          const tokenSymbol = (tx.tokenSymbol || '').toUpperCase();
          const isUSDC = tokenSymbol === 'USDC';
          const isWETH = tokenSymbol === 'WETH' || tokenSymbol === 'WETHEREUM';
          const isValidToken = isUSDC || isWETH;
          
          if (!isToFeeAddress) {
            console.log(`⚠️ Skipping transaction ${tx.hash}: not TO fee address (to: ${tx.to})`);
          } else if (!isValidToken) {
            console.log(`⚠️ Skipping transaction ${tx.hash}: invalid token ${tokenSymbol} (expected USDC or WETH)`);
          }
          
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
            blockNumber: parseInt(tx.blockNumber),
          };
        });
      
      transactions.push(...tokenTxs);
      console.log(`✅ Fetched ${tokenTxs.length} USDC/WETH transactions TO fee address ${ETHEREUM_ADDRESS} (out of ${tokenResults.length} total token transactions)`);
      
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
      
      console.log('💰 Ethereum Fee token breakdown:');
      Object.entries(tokenBreakdown).forEach(([symbol, data]) => {
        const total = Number(data.totalValue) / (10 ** data.decimals);
        console.log(`  ${symbol}: ${data.count} transactions, ${total.toFixed(6)} tokens`);
      });
    } else {
      console.log('⚠️ No token transactions found. API response may be empty or error.');
      console.log('⚠️ Verify contract address:', ETHEREUM_ADDRESS);
      console.log('⚠️ Verify chain ID: 1 (Ethereum Mainnet)');
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

export async function fetchHyperEVMTransactions(startBlock?: number): Promise<Transaction[]> {
  try {
    const transactions: Transaction[] = [];
    
    // Log the contract address being used for HyperEVM
    console.log('🔍 HYPEREVM NETWORK - Using contract address:', HYPEREVM_ADDRESS);
    console.log('🔍 HYPEREVM NETWORK - Chain ID: 999 (HyperEVM)');
    
    // Check if API key is available
    if (!ETHERSCAN_API_KEY) {
      console.warn('ETHERSCAN_API_KEY not set. API calls may be rate-limited.');
    }
    
    // Fetch ERC-20 token transfers - focus on USDC (HUSDC) and WHYPE
    // Using Etherscan API V2 with chainid=999 for HyperEVM
    // Use pagination (though HyperEVM has fewer transactions, it's good practice)
    const baseUrl = `https://api.etherscan.io/v2/api?chainid=999&module=account&action=tokentx&address=${HYPEREVM_ADDRESS}&sort=asc${ETHERSCAN_API_KEY ? `&apikey=${ETHERSCAN_API_KEY}` : ''}`;
    
    console.log('🔗 HyperEVM API URL (base):', baseUrl.replace(ETHERSCAN_API_KEY || '', 'API_KEY_HIDDEN'));
    
    let tokenResults: any[] = [];
    try {
      console.log('Starting HyperEVM API fetch with pagination...');
      const startTime = Date.now();
      
      // Fetch with pagination by block ranges
      // If startBlock is provided, only fetch from that block onwards (incremental update)
      const fetchStartBlock = startBlock !== undefined ? startBlock : 0;
      console.log(`📊 Fetching HyperEVM transactions from block ${fetchStartBlock} onwards`);
      tokenResults = await fetchTransactionsPaginated(baseUrl, fetchStartBlock, 99999999, 'hyperevm');
      
      const duration = Date.now() - startTime;
      console.log(`✅ HyperEVM API fetch completed in ${duration}ms, got ${tokenResults.length} total results`);
    } catch (fetchError) {
      const errorMsg = `Failed to fetch HyperEVM transactions: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
      console.error(errorMsg);
      if (!ETHERSCAN_API_KEY) {
        throw new Error('ETHERSCAN_API_KEY environment variable is required. Please set it in Vercel environment variables.');
      }
      throw new Error(errorMsg);
    }
    
    if (tokenResults.length > 0) {
      console.log(`📊 Processing ${tokenResults.length} raw token transactions from HyperEVM API...`);
      
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
          
          if (!isToFeeAddress) {
            console.log(`⚠️ Skipping transaction ${tx.hash}: not TO fee address (to: ${tx.to})`);
          } else if (!isValidToken) {
            console.log(`⚠️ Skipping transaction ${tx.hash}: invalid token ${tokenSymbol} (expected USDC or WHYPE)`);
          }
          
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
            blockNumber: parseInt(tx.blockNumber),
          };
        });
      
      transactions.push(...tokenTxs);
      console.log(`✅ Fetched ${tokenTxs.length} relevant token transactions TO fee address ${HYPEREVM_ADDRESS} from HyperEVM (out of ${tokenResults.length} total token transactions)`);
      
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
      
      console.log('💰 HyperEVM Token breakdown:');
      Object.entries(tokenBreakdown).forEach(([symbol, data]) => {
        const decimals = tokenTxs.find(tx => tx.tokenSymbol === symbol)?.tokenDecimal || 18;
        const total = Number(data.totalValue) / (10 ** decimals);
        console.log(`  ${symbol}: ${data.count} transactions, ${total.toFixed(6)} tokens`);
      });
    } else {
      console.log('⚠️ No token transactions found for HyperEVM. API response may be empty or error.');
      console.log('⚠️ Verify contract address:', HYPEREVM_ADDRESS);
      console.log('⚠️ Verify chain ID: 999 (HyperEVM)');
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

