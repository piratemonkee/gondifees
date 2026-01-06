import { NextResponse } from 'next/server';
import { fetchEthereumTransactions } from '@/lib/blockchain';
import { aggregateFees } from '@/lib/aggregate';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    console.log('🚀 Starting GONDI fee data fetch...');
    
    // Fetch Ethereum transactions (USDC, WETH, ETH)
    const transactions = await fetchEthereumTransactions();
    
    // If no transactions or very few transactions, fall back to demo data in production
    if (transactions.length === 0 || (transactions.length < 100 && process.env.VERCEL === '1')) {
      console.warn('⚠️ API returned insufficient data, falling back to demo data');
      const { generateDemoData } = await import('@/lib/demo-data');
      const demoTransactions = generateDemoData();
      console.log(`📊 Using demo data: ${demoTransactions.length} transactions`);
      
      // Use demo data but still try to aggregate normally
      const demoAggregated = await aggregateFees(demoTransactions);
      const demoGrandTotalUSD = Object.values(demoAggregated.currencyBreakdown).reduce((sum, breakdown) => sum + breakdown.totalUSD, 0);
      
      return NextResponse.json({
        success: true,
        data: demoAggregated,
        recentTransactions: demoTransactions.slice(0, 10).map(tx => ({
          hash: tx.hash,
          timestamp: tx.timestamp,
          tokenSymbol: tx.tokenSymbol,
          value: tx.value,
          tokenDecimal: tx.tokenDecimal,
          from: tx.from,
          to: tx.to,
          network: tx.network,
          usdValue: 0 // Will be calculated client-side
        })),
        meta: {
          totalTransactions: demoTransactions.length,
          totalUSD: demoGrandTotalUSD,
          isDemo: true,
          reason: transactions.length === 0 ? 'No API data available' : 'Insufficient API data, supplemented with demo'
        }
      });
    }

    console.log(`📊 Processing ${transactions.length} transactions...`);
    console.log(`🔍 Transaction breakdown by currency:`);
    const currencyCount: Record<string, number> = {};
    transactions.forEach(tx => {
      const symbol = tx.tokenSymbol || 'UNKNOWN';
      currencyCount[symbol] = (currencyCount[symbol] || 0) + 1;
    });
    console.log(currencyCount);
    
    // Aggregate fees with USD conversion
    const aggregated = await aggregateFees(transactions);
    
    // Calculate total USD value
    const grandTotalUSD = Object.values(aggregated.currencyBreakdown).reduce((sum, breakdown) => sum + breakdown.totalUSD, 0);
    console.log(`✅ Aggregation complete! Total: $${grandTotalUSD.toFixed(2)}`);
    
    // Ensure currency breakdown exists and has proper structure
    if (!aggregated.currencyBreakdown || Object.keys(aggregated.currencyBreakdown).length === 0) {
      console.warn('⚠️ No currency breakdown data found, this might indicate API issues');
    } else {
      console.log(`💰 Currency breakdown keys:`, Object.keys(aggregated.currencyBreakdown));
    }
    
    console.log(`📅 Monthly data keys:`, Object.keys(aggregated.monthly));

    // Get recent transactions for display
    const { getMultipleTokenPrices } = await import('@/lib/prices');
    const { parseTransactionValue } = await import('@/lib/blockchain');
    
    const currencies = new Set<string>();
    transactions.forEach(tx => {
      if (tx.tokenSymbol) {
        currencies.add(tx.tokenSymbol.toUpperCase());
      }
    });
    const prices = await getMultipleTokenPrices(Array.from(currencies));

    const recentTransactions = [...transactions]
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
      stats: {
        totalTransactions: transactions.length,
        totalUSD: grandTotalUSD,
        currencies: Object.keys(aggregated.currencyBreakdown),
      },
      environment: {
        isProduction: process.env.VERCEL === '1',
        nodeEnv: process.env.NODE_ENV,
        hasApiKey: !!process.env.ETHERSCAN_API_KEY,
      },
    });
  } catch (error) {
    console.error('Error fetching fees:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    let hint = 'Check server logs for more details';
    if (errorMessage.includes('ETHERSCAN_API_KEY')) {
      hint = 'Please set ETHERSCAN_API_KEY in environment variables';
    } else if (errorMessage.includes('timeout')) {
      hint = 'API request timed out. Try again in a moment.';
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