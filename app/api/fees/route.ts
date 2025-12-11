import { NextResponse } from 'next/server';
import { fetchEthereumTransactions, fetchHyperEVMTransactions } from '@/lib/blockchain';
import { aggregateFees } from '@/lib/aggregate';
import { generateDemoData } from '@/lib/demo-data';
import { parseCSVTransactions } from '@/lib/csv-parser';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { 
  getStartBlock, 
  updateLastProcessedTransaction, 
  findLatestTransaction,
  getLastProcessedTransaction 
} from '@/lib/last-processed';
import { Transaction } from '@/lib/types';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

// Track function start time to prevent timeout
const FUNCTION_START_TIME = Date.now();
const MAX_FUNCTION_DURATION = 55000; // 55 seconds (leave 5s buffer)

function checkTimeRemaining(): number {
  const elapsed = Date.now() - FUNCTION_START_TIME;
  return MAX_FUNCTION_DURATION - elapsed;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const useDemo = searchParams.get('demo') === 'true';
    const forceApi = searchParams.get('forceApi') === 'true';
    
    // Check if we're in production (Vercel)
    const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    
    let allTransactions: any[] = [];
    let isDemo = false;
    
    if (useDemo) {
      console.log('Using demo data for preview...');
      allTransactions = generateDemoData();
      isDemo = true;
    } else {
      // Always use API in production, or if forceApi is true
      // Only try CSV files in local development
      let useCsv = false;
      if (!isProduction && !forceApi) {
        // Try CSV files only in local development
        // Support multiple possible CSV locations
        const possibleCsvPaths = [
          '/Users/guimar/Downloads/export-address-token-0x4169447a424ec645f8a24dccfd8328f714dd5562.csv',
          process.env.ETHEREUM_CSV_PATH,
          join(process.cwd(), 'data', 'ethereum-transactions.csv'),
          join(process.cwd(), 'ethereum-transactions.csv'),
        ].filter(Boolean) as string[];
        
        const possibleHyperEvmPaths = [
          '/Users/guimar/Downloads/export-address-token-0xbc0b9c63dc0581278d4b554af56858298bf2a9ec.csv',
          process.env.HYPEREVM_CSV_PATH,
          join(process.cwd(), 'data', 'hyperevm-transactions.csv'),
          join(process.cwd(), 'hyperevm-transactions.csv'),
        ].filter(Boolean) as string[];
        
        try {
          // Try to find Ethereum CSV file
          let ethereumTxs: any[] = [];
          let ethereumCsvFound = false;
          for (const csvPath of possibleCsvPaths) {
            try {
              if (csvPath && existsSync(csvPath)) {
                const ethereumCsvContent = readFileSync(csvPath, 'utf-8');
                ethereumTxs = parseCSVTransactions(ethereumCsvContent, 'ethereum');
                console.log(`✅ Loaded ${ethereumTxs.length} Ethereum transactions from CSV: ${csvPath}`);
                ethereumCsvFound = true;
                break;
              }
            } catch (err) {
              // Try next path
              continue;
            }
          }
          
          if (!ethereumCsvFound) {
            console.log('ℹ️ Ethereum CSV file not found, will use API. Tried paths:', possibleCsvPaths);
          }
          
          // Try to find HyperEVM CSV file
          let hyperevmTxs: any[] = [];
          let hyperevmCsvFound = false;
          for (const csvPath of possibleHyperEvmPaths) {
            try {
              if (csvPath && existsSync(csvPath)) {
                const hyperevmCsvContent = readFileSync(csvPath, 'utf-8');
                hyperevmTxs = parseCSVTransactions(hyperevmCsvContent, 'hyperevm');
                console.log(`✅ Loaded ${hyperevmTxs.length} HyperEVM transactions from CSV: ${csvPath}`);
                hyperevmCsvFound = true;
                break;
              }
            } catch (err) {
              // Try next path
              continue;
            }
          }
          
          if (!hyperevmCsvFound) {
            console.log('ℹ️ HyperEVM CSV file not found, will use API. Tried paths:', possibleHyperEvmPaths);
          }
          
          allTransactions = [...ethereumTxs, ...hyperevmTxs];
          
          if (allTransactions.length > 0) {
            useCsv = true;
            console.log(`✅ Using CSV data: ${ethereumTxs.length} Ethereum + ${hyperevmTxs.length} HyperEVM transactions`);
          } else {
            console.log('ℹ️ No CSV data found, will use API instead');
          }
        } catch (csvError) {
          console.log('ℹ️ Could not read CSV files, will use API:', csvError instanceof Error ? csvError.message : String(csvError));
        }
      }
      
      // Use API if not using CSV
      if (!useCsv) {
        const { searchParams } = new URL(request.url);
        const incrementalParam = searchParams.get('incremental');
        const fullRefresh = searchParams.get('fullRefresh') === 'true';
        
        // Smart default: only use incremental if we have last processed data, otherwise do full fetch
        // But if incremental is explicitly set to false, respect that
        const hasLastProcessed = getLastProcessedTransaction('ethereum') || getLastProcessedTransaction('hyperevm');
        const incremental = fullRefresh 
          ? false 
          : (incrementalParam === 'true' || (incrementalParam !== 'false' && hasLastProcessed));
        
        if (fullRefresh) {
          console.log('🔄 Full refresh requested - fetching all transactions from October 22, 2025');
        } else if (incremental && hasLastProcessed) {
          console.log('🔄 Incremental update - fetching only new transactions since last update');
        } else {
          console.log('🔄 Initial load or no last processed data - fetching all transactions (this may take a while)');
        }
        
        try {
          // Get start blocks for incremental fetching
          // If no last processed data and not explicitly incremental, start from 0 (full fetch)
          const ethereumStartBlock = fullRefresh 
            ? 0 
            : (incremental && hasLastProcessed ? getStartBlock('ethereum') : 0);
          const hyperevmStartBlock = fullRefresh 
            ? 0 
            : (incremental && hasLastProcessed ? getStartBlock('hyperevm') : 0);
          
          console.log(`📊 Fetch strategy: Ethereum from block ${ethereumStartBlock}, HyperEVM from block ${hyperevmStartBlock}`);
          
          // Check time remaining before starting API calls
          const timeRemaining = checkTimeRemaining();
          if (timeRemaining < 10000) {
            console.warn('⚠️ Not enough time remaining, returning timeout error early');
            return NextResponse.json({
              success: false,
              error: 'Request Timeout',
              details: 'The request would take too long. Please use "Full Refresh" button or try again later.',
              hint: 'For first-time setup, the initial data fetch may take longer. Try using the "Full Refresh" button.',
              timeout: true,
            }, { status: 504 });
          }
          
          // Fetch both APIs independently so one failure doesn't break the other
          // Use dynamic timeout based on remaining function time
          const API_TIMEOUT = Math.min(40000, timeRemaining - 10000); // Leave 10s buffer for processing
          console.log(`⏱️ Starting API calls with ${API_TIMEOUT}ms timeout (${timeRemaining}ms remaining)`);
          
          const fetchWithTimeout = async <T>(
            promise: Promise<T>,
            timeoutMs: number,
            network: string
          ): Promise<T> => {
            const timeoutPromise = new Promise<T>((_, reject) => {
              setTimeout(() => {
                reject(new Error(`${network} API request timed out after ${timeoutMs}ms`));
              }, timeoutMs);
            });
            return Promise.race([promise, timeoutPromise]);
          };
          
          const [ethereumResult, hyperevmResult] = await Promise.allSettled([
            fetchWithTimeout(
              fetchEthereumTransactions(ethereumStartBlock),
              API_TIMEOUT,
              'Ethereum'
            ),
            fetchWithTimeout(
              fetchHyperEVMTransactions(hyperevmStartBlock),
              API_TIMEOUT,
              'HyperEVM'
            ),
          ]);

          const ethereumTxs = ethereumResult.status === 'fulfilled' ? ethereumResult.value : [];
          const hyperevmTxs = hyperevmResult.status === 'fulfilled' ? hyperevmResult.value : [];

          // Log detailed error information for production debugging
          if (ethereumResult.status === 'rejected') {
            const error = ethereumResult.reason;
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('❌ Ethereum API failed:', errorMsg);
            console.error('Ethereum error details:', {
              message: errorMsg,
              stack: error instanceof Error ? error.stack : undefined,
              hasApiKey: !!process.env.ETHERSCAN_API_KEY,
              isProduction: process.env.VERCEL === '1',
              isTimeout: errorMsg.includes('timeout') || errorMsg.includes('aborted'),
              vercelFunctionTimeout: process.env.VERCEL ? 'Check vercel.json maxDuration' : 'N/A'
            });
            
            // If it's a timeout, provide helpful message
            if (errorMsg.includes('timeout') || errorMsg.includes('aborted')) {
              console.error('⚠️ TIMEOUT ISSUE: Ethereum has many transactions and may be timing out.');
              console.error('💡 The function timeout is set to 60s in vercel.json, but the API request timeout is 25s.');
            }
          }
          if (hyperevmResult.status === 'rejected') {
            const error = hyperevmResult.reason;
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('❌ HyperEVM API failed:', errorMsg);
            console.error('HyperEVM error details:', {
              message: errorMsg,
              stack: error instanceof Error ? error.stack : undefined,
              hasApiKey: !!process.env.ETHERSCAN_API_KEY,
              isProduction: process.env.VERCEL === '1'
            });
          }

          console.log(`✅ Ethereum transactions from API: ${ethereumTxs.length} (from block ${ethereumStartBlock})`);
          console.log(`✅ HyperEVM transactions from API: ${hyperevmTxs.length} (from block ${hyperevmStartBlock})`);
          
          // Log breakdown by token for debugging
          const ethereumByToken: { [key: string]: number } = {};
          ethereumTxs.forEach(tx => {
            const symbol = (tx.tokenSymbol || '').toUpperCase();
            ethereumByToken[symbol] = (ethereumByToken[symbol] || 0) + 1;
          });
          console.log('Ethereum transactions by token:', ethereumByToken);
          
          const hyperevmByToken: { [key: string]: number } = {};
          hyperevmTxs.forEach(tx => {
            const symbol = (tx.tokenSymbol || '').toUpperCase();
            hyperevmByToken[symbol] = (hyperevmByToken[symbol] || 0) + 1;
          });
          console.log('HyperEVM transactions by token:', hyperevmByToken);

          // If incremental update, we need to merge with existing transactions
          // For now, we'll fetch all transactions on each update
          // In production, you'd store all transactions in a database and only fetch new ones
          if (incremental && !fullRefresh) {
            const lastEthereum = getLastProcessedTransaction('ethereum');
            const lastHyperEVM = getLastProcessedTransaction('hyperevm');
            
            if (lastEthereum || lastHyperEVM) {
              console.log('🔄 Incremental update mode:');
              if (lastEthereum) {
                console.log(`  Ethereum: last processed block ${lastEthereum.blockNumber}, fetched ${ethereumTxs.length} new transactions`);
              }
              if (lastHyperEVM) {
                console.log(`  HyperEVM: last processed block ${lastHyperEVM.blockNumber}, fetched ${hyperevmTxs.length} new transactions`);
              }
            } else {
              console.log('🔄 First time update: fetching all transactions from October 22, 2025');
            }
          }
          
          // Update last processed transactions if we got new data
          if (ethereumTxs.length > 0) {
            const latestEthereum = findLatestTransaction(ethereumTxs);
            if (latestEthereum) {
              updateLastProcessedTransaction(
                'ethereum',
                latestEthereum.blockNumber,
                latestEthereum.timestamp,
                latestEthereum.hash
              );
              console.log(`✅ Updated Ethereum last processed: block ${latestEthereum.blockNumber}`);
            }
          } else if (ethereumStartBlock > 0) {
            console.log(`ℹ️ No new Ethereum transactions found (checked from block ${ethereumStartBlock})`);
          }
          
          if (hyperevmTxs.length > 0) {
            const latestHyperEVM = findLatestTransaction(hyperevmTxs);
            if (latestHyperEVM) {
              updateLastProcessedTransaction(
                'hyperevm',
                latestHyperEVM.blockNumber,
                latestHyperEVM.timestamp,
                latestHyperEVM.hash
              );
              console.log(`✅ Updated HyperEVM last processed: block ${latestHyperEVM.blockNumber}`);
            }
          } else if (hyperevmStartBlock > 0) {
            console.log(`ℹ️ No new HyperEVM transactions found (checked from block ${hyperevmStartBlock})`);
          }

          allTransactions = [...ethereumTxs, ...hyperevmTxs];
          
          // If this is an incremental update with new transactions, we need to merge with existing data
          // For now, we'll return the new transactions and let the frontend handle merging
          // In production, you'd merge server-side with a database
          if (incremental && !fullRefresh && allTransactions.length > 0) {
            console.log(`📊 Incremental update: ${allTransactions.length} new transactions to process`);
          }
          
          if (allTransactions.length === 0) {
            const hasApiKey = !!process.env.ETHERSCAN_API_KEY;
            const ethereumError = ethereumResult.status === 'rejected';
            const hyperevmError = hyperevmResult.status === 'rejected';
            const hasTimeout = (ethereumError && ethereumResult.reason?.message?.includes('timeout')) ||
                              (hyperevmError && hyperevmResult.reason?.message?.includes('timeout'));
            
            if (hasTimeout) {
              const errorMsg = 'Request timed out. The initial data fetch is too large. Please use "Full Refresh" button or try again later.';
              console.error('❌ Timeout error:', errorMsg);
              return NextResponse.json({
                success: false,
                error: 'Request Timeout',
                details: errorMsg,
                hint: 'Try using the "Full Refresh" button, or wait a moment and try again. For first-time setup, the initial fetch may take longer.',
                timeout: true,
              }, { status: 504 });
            }
            
            const errorMsg = hasApiKey
              ? 'No transactions found from APIs. This could be due to:\n' +
                '1. API rate limits exceeded (wait a moment and try again)\n' +
                '2. Network timeout (Vercel functions have execution time limits)\n' +
                '3. API temporarily unavailable'
              : 'ETHERSCAN_API_KEY environment variable is not set in Vercel. Please add it in your Vercel project settings under Environment Variables.';
            console.error('❌', errorMsg);
            console.error('Environment check:', {
              hasApiKey,
              isProduction: process.env.VERCEL === '1',
              nodeEnv: process.env.NODE_ENV,
              vercelEnv: process.env.VERCEL_ENV
            });
            throw new Error(errorMsg);
          }
        } catch (apiError) {
          console.error('API fetch error:', apiError);
          const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
          const hasApiKey = !!process.env.ETHERSCAN_API_KEY;
          
          // Provide more helpful error messages based on the issue
          let userFriendlyError = 'Failed to fetch from blockchain APIs. ';
          if (!hasApiKey) {
            userFriendlyError += 'ETHERSCAN_API_KEY is not set in Vercel environment variables. Please add it in your Vercel project settings.';
          } else if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
            userFriendlyError += 'Request timed out. This may be due to Vercel function execution limits. Try again in a moment.';
          } else if (errorMessage.includes('rate limit')) {
            userFriendlyError += 'API rate limit exceeded. Please wait a moment and try again.';
          } else {
            userFriendlyError += errorMessage;
          }
          
          throw new Error(userFriendlyError);
        }
      }
    }

    console.log('\n🔄 Starting fee aggregation...');
    console.log(`Total transactions to aggregate: ${allTransactions.length}`);
    console.log(`  - Ethereum: ${allTransactions.filter(tx => tx.network === 'ethereum').length}`);
    console.log(`  - HyperEVM: ${allTransactions.filter(tx => tx.network === 'hyperevm').length}`);
    
    // Aggregate fees (now async and includes USD conversion)
    const aggregated = await aggregateFees(allTransactions);
    
    // Log final summary
    const grandTotalUSD = Object.values(aggregated.currencyBreakdown).reduce((sum, breakdown) => sum + breakdown.totalUSD, 0);
    console.log(`\n✅ Aggregation complete! Grand total: $${grandTotalUSD.toFixed(2)}`);
    console.log(`Expected: ~$68,000 | Actual: $${grandTotalUSD.toFixed(2)} | Difference: $${(grandTotalUSD - 68000).toFixed(2)}`);

    // Get prices for USD conversion
    const { getMultipleTokenPrices } = await import('@/lib/prices');
    const { parseTransactionValue } = await import('@/lib/blockchain');
    const currencies = new Set<string>();
    allTransactions.forEach(tx => {
      if (tx.tokenSymbol) {
        currencies.add(tx.tokenSymbol.toUpperCase());
      }
    });
    const prices = await getMultipleTokenPrices(Array.from(currencies));

    // Get last 20 transactions sorted by timestamp (most recent first)
    const recentTransactions = [...allTransactions]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20)
      .map(tx => {
        const currency = (tx.tokenSymbol || '').toUpperCase();
        const value = parseTransactionValue(tx.value, tx.tokenDecimal || 18);
        const price = prices[currency] || 0;
        const usdValue = value * price;
        
        return {
          hash: tx.hash,
          timestamp: tx.timestamp,
          tokenSymbol: tx.tokenSymbol,
          value: tx.value,
          tokenDecimal: tx.tokenDecimal || 18,
          from: tx.from,
          to: tx.to,
          network: tx.network,
          usdValue: usdValue,
        };
      });

    // Get last processed info for response
    const lastEthereum = getLastProcessedTransaction('ethereum');
    const lastHyperEVM = getLastProcessedTransaction('hyperevm');
    
    return NextResponse.json({
      success: true,
      data: aggregated,
      recentTransactions,
      isDemo,
      stats: {
        totalTransactions: allTransactions.length,
        ethereumTransactions: allTransactions.filter(tx => tx.network === 'ethereum').length,
        hyperevmTransactions: allTransactions.filter(tx => tx.network === 'hyperevm').length,
      },
      lastProcessed: {
        ethereum: lastEthereum ? {
          blockNumber: lastEthereum.blockNumber,
          timestamp: lastEthereum.timestamp,
          hash: lastEthereum.hash,
          lastUpdated: lastEthereum.lastUpdated,
        } : null,
        hyperevm: lastHyperEVM ? {
          blockNumber: lastHyperEVM.blockNumber,
          timestamp: lastHyperEVM.timestamp,
          hash: lastHyperEVM.hash,
          lastUpdated: lastHyperEVM.lastUpdated,
        } : null,
      },
      version: '2025-01-11-v3', // Version identifier for debugging (incremental updates)
      commitHash: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'local',
      buildId: process.env.VERCEL ? (process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'unknown') : 'local',
      environment: {
        isProduction: process.env.VERCEL === '1',
        nodeEnv: process.env.NODE_ENV,
        hasApiKey: !!process.env.ETHERSCAN_API_KEY,
        vercelEnv: process.env.VERCEL_ENV || 'local',
      },
    });
  } catch (error) {
    console.error('Error fetching fees:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error ? error.stack : undefined;
    
    // Log full error details for debugging
    console.error('Full error details:', {
      message: errorMessage,
      stack: errorDetails,
      env: {
        hasApiKey: !!process.env.ETHERSCAN_API_KEY,
        isProduction: process.env.VERCEL === '1',
        nodeEnv: process.env.NODE_ENV
      }
    });
    
    // Provide helpful hints based on error type
    let hint = 'Check server logs for more details';
    if (errorMessage.includes('ETHERSCAN_API_KEY')) {
      hint = 'Please set ETHERSCAN_API_KEY in Vercel project settings > Environment Variables';
    } else if (errorMessage.includes('timeout')) {
      hint = 'Vercel functions have execution time limits. The request may have timed out.';
    } else if (errorMessage.includes('rate limit')) {
      hint = 'API rate limit exceeded. Wait a moment and try again.';
    }
    
    // Always return valid JSON, even on error
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch fee data',
        details: errorMessage,
        hint: hint,
        env: {
          hasApiKey: !!process.env.ETHERSCAN_API_KEY,
          isProduction: process.env.VERCEL === '1',
          nodeEnv: process.env.NODE_ENV
        }
      },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );
  }
}

