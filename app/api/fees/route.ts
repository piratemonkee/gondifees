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
    console.log(`📊 Processing ${transactions.length} transactions...`);
    
    // Aggregate fees with USD conversion
    const aggregated = await aggregateFees(transactions);
    
    // Calculate total USD value
    const grandTotalUSD = Object.values(aggregated.currencyBreakdown).reduce((sum, breakdown) => sum + breakdown.totalUSD, 0);
    console.log(`✅ Aggregation complete! Total: $${grandTotalUSD.toFixed(2)}`);

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
    });
  } catch (error) {
    console.error('Error fetching fees:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch fee data'
      },
      { status: 500 }
    );
  }
}