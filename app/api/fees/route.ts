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
    const forceApi = searchParams.get('forceApi') === 'true'; // Force API fetching, skip CSV
    
    let allTransactions: any[] = [];
    let isDemo = false;
    
    if (useDemo) {
      console.log('Using demo data for preview...');
      allTransactions = generateDemoData();
      isDemo = true;
    } else if (forceApi) {
      // Force API fetching (for Update button) - fetch from blockchain APIs
      console.log('Update mode: Fetching transactions from Ethereum and HyperEVM APIs...');
      
      const [ethereumTxs, hyperevmTxs] = await Promise.all([
        fetchEthereumTransactions(),
        fetchHyperEVMTransactions(),
      ]);

      console.log(`Ethereum transactions from API: ${ethereumTxs.length}`);
      console.log(`HyperEVM transactions from API: ${hyperevmTxs.length}`);

      allTransactions = [...ethereumTxs, ...hyperevmTxs];
      
      if (allTransactions.length === 0) {
        console.log('No transactions found from APIs. This could be due to:');
        console.log('1. API rate limiting');
        console.log('2. Network issues');
        console.log('3. No transactions matching the criteria');
        throw new Error('No data available from APIs');
      }
    } else {
      // Try to read from CSV files first (for local development)
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
        
        if (allTransactions.length === 0) {
          throw new Error('CSV files empty or invalid');
        }
      } catch (csvError) {
        console.log('Could not read CSV file, falling back to API:', csvError);
        
        // Fallback to API
        console.log('Fetching transactions from Ethereum and HyperEVM...');
        
        const [ethereumTxs, hyperevmTxs] = await Promise.all([
          fetchEthereumTransactions(),
          fetchHyperEVMTransactions(),
        ]);

        console.log(`Ethereum transactions: ${ethereumTxs.length}`);
        console.log(`HyperEVM transactions: ${hyperevmTxs.length}`);

        allTransactions = [...ethereumTxs, ...hyperevmTxs];
        
        if (allTransactions.length === 0) {
          console.log('No real data found, using demo data...');
          allTransactions = generateDemoData();
          isDemo = true;
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
    });
  } catch (error) {
    console.error('Error fetching fees:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch fee data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

