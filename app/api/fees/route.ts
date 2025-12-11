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
          // Fetch both APIs independently so one failure doesn't break the other
          const [ethereumResult, hyperevmResult] = await Promise.allSettled([
            fetchEthereumTransactions(),
            fetchHyperEVMTransactions(),
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
              isProduction: process.env.VERCEL === '1'
            });
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

          console.log(`✅ Ethereum transactions from API: ${ethereumTxs.length}`);
          console.log(`✅ HyperEVM transactions from API: ${hyperevmTxs.length}`);

          allTransactions = [...ethereumTxs, ...hyperevmTxs];
          
          if (allTransactions.length === 0) {
            const hasApiKey = !!process.env.ETHERSCAN_API_KEY;
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
      version: '2025-01-11-v2', // Version identifier for debugging
      environment: {
        isProduction: process.env.VERCEL === '1',
        nodeEnv: process.env.NODE_ENV,
        hasApiKey: !!process.env.ETHERSCAN_API_KEY,
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
      { status: 500 }
    );
  }
}

