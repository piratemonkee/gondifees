import { NextResponse } from 'next/server';
import { fetchEthereumTransactions, fetchHyperEVMTransactions } from '@/lib/blockchain';
import { aggregateFees } from '@/lib/aggregate';
import { generateDemoData } from '@/lib/demo-data';
import { parseCSVTransactions } from '@/lib/csv-parser';
import { readFileSync } from 'fs';
import { join } from 'path';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

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
        try {
          const ethereumCsvPath = '/Users/guimar/Downloads/export-address-token-0x4169447a424ec645f8a24dccfd8328f714dd5562.csv';
          const hyperevmCsvPath = '/Users/guimar/Downloads/export-address-token-0xbc0b9c63dc0581278d4b554af56858298bf2a9ec.csv';
          
          const ethereumCsvContent = readFileSync(ethereumCsvPath, 'utf-8');
          const ethereumTxs = parseCSVTransactions(ethereumCsvContent, 'ethereum');
          console.log(`Loaded ${ethereumTxs.length} Ethereum transactions from CSV`);
          
          let hyperevmTxs: any[] = [];
          try {
            const hyperevmCsvContent = readFileSync(hyperevmCsvPath, 'utf-8');
            hyperevmTxs = parseCSVTransactions(hyperevmCsvContent, 'hyperevm');
            console.log(`Loaded ${hyperevmTxs.length} HyperEVM transactions from CSV`);
          } catch (hyperevmError) {
            console.log('Could not read HyperEVM CSV file:', hyperevmError);
          }
          
          allTransactions = [...ethereumTxs, ...hyperevmTxs];
          
          if (allTransactions.length > 0) {
            useCsv = true;
          }
        } catch (csvError) {
          console.log('Could not read CSV file, will use API:', csvError);
        }
      }
      
      // Use API if not using CSV
      if (!useCsv) {
        console.log('Fetching transactions from Ethereum and HyperEVM APIs...');
        
        try {
          const [ethereumTxs, hyperevmTxs] = await Promise.all([
            fetchEthereumTransactions(),
            fetchHyperEVMTransactions(),
          ]);

          console.log(`Ethereum transactions from API: ${ethereumTxs.length}`);
          console.log(`HyperEVM transactions from API: ${hyperevmTxs.length}`);

          allTransactions = [...ethereumTxs, ...hyperevmTxs];
          
          if (allTransactions.length === 0) {
            const errorMsg = 'No transactions found from APIs. Please check:\n' +
              '1. ETHERSCAN_API_KEY environment variable is set in Vercel\n' +
              '2. API rate limits have not been exceeded\n' +
              '3. Network connectivity is working';
            console.error(errorMsg);
            throw new Error(errorMsg);
          }
        } catch (apiError) {
          console.error('API fetch error:', apiError);
          const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
          throw new Error(`Failed to fetch from blockchain APIs: ${errorMessage}. Please ensure ETHERSCAN_API_KEY is set in Vercel environment variables.`);
        }
      }
    }

    // Aggregate fees (now async and includes USD conversion)
    const aggregated = await aggregateFees(allTransactions);

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

    // Classify fees for recent transactions (last 50 unique hashes)
    const { classifyFeeType, fetchTransactionInputData } = await import('@/lib/fee-classifier');
    const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
    
    const sortedTxs = [...allTransactions].sort((a, b) => b.timestamp - a.timestamp);
    const uniqueHashes = Array.from(new Set(sortedTxs.map(tx => tx.hash))).slice(0, 50);
    const feeTypeMap = new Map<string, string>();
    
    // Classify fees for unique transaction hashes
    for (const hash of uniqueHashes) {
      try {
        const chainId = sortedTxs.find(tx => tx.hash === hash)?.network === 'ethereum' ? 1 : 999;
        const inputData = await fetchTransactionInputData(hash, chainId, ETHERSCAN_API_KEY);
        const feeType = classifyFeeType(inputData);
        feeTypeMap.set(hash, feeType);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        feeTypeMap.set(hash, 'unknown');
      }
    }
    
    // Apply fee types to all transactions
    allTransactions = allTransactions.map(tx => ({
      ...tx,
      feeType: feeTypeMap.get(tx.hash) || 'unknown',
    }));

    // Get last 20 transactions sorted by timestamp (most recent first)
    const recentTransactions = sortedTxs
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
          feeType: feeTypeMap.get(tx.hash) || 'unknown',
        };
      });

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
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch fee data',
        details: errorMessage,
        hint: errorMessage.includes('ETHERSCAN_API_KEY') 
          ? 'Please set ETHERSCAN_API_KEY in Vercel environment variables'
          : 'Check server logs for more details'
      },
      { status: 500 }
    );
  }
}

