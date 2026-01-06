import { Transaction, AggregatedFees } from './types';
import { parseTransactionValue } from './blockchain';
import { format, startOfWeek, startOfMonth } from 'date-fns';
import { getMultipleTokenPrices } from './prices';

function createEmptyPeriodData() {
  return {
    total: 0,
    totalUSD: 0,
    currencies: {} as { [currency: string]: number },
    currenciesUSD: {} as { [currency: string]: number },
    byCategory: {
      loan_usdc: { total: 0, totalUSD: 0 },
      loan_weth: { total: 0, totalUSD: 0 },
      sales_usdc: { total: 0, totalUSD: 0 },
      sales_weth: { total: 0, totalUSD: 0 },
      uncategorized: { total: 0, totalUSD: 0 },
    },
  };
}

export async function aggregateFees(transactions: Transaction[]): Promise<AggregatedFees> {
  console.log(`📊 Aggregating ${transactions.length} transactions...`);
  
  const daily: { [date: string]: ReturnType<typeof createEmptyPeriodData> } = {};
  const weekly: { [week: string]: ReturnType<typeof createEmptyPeriodData> } = {};
  const monthly: { [month: string]: ReturnType<typeof createEmptyPeriodData> } = {};
  const currencyTotals: { [currency: string]: number } = {};
  const currencyTotalsUSD: { [currency: string]: number } = {};
  const categoryTotals = {
    loan_usdc: { total: 0, totalUSD: 0, count: 0 },
    loan_weth: { total: 0, totalUSD: 0, count: 0 },
    sales_usdc: { total: 0, totalUSD: 0, count: 0 },
    sales_weth: { total: 0, totalUSD: 0, count: 0 },
    uncategorized: { total: 0, totalUSD: 0, count: 0 },
  };

  // Get all unique currencies for price fetching
  const currencies = new Set<string>();
  transactions.forEach(tx => {
    let symbol = (tx.tokenSymbol || '').toUpperCase();
    // Use WETH price for ETH
    if (symbol === 'ETH') symbol = 'WETH';
    if (symbol) {
      currencies.add(symbol);
    }
  });
  
  console.log('💰 Currencies found:', Array.from(currencies));

  // Fetch current prices
  const prices = await getMultipleTokenPrices(Array.from(currencies));
  console.log('💵 Token prices:', prices);

  transactions.forEach(tx => {
    const date = new Date(tx.timestamp);
    const dateStr = format(date, 'yyyy-MM-dd');
    const weekStr = format(startOfWeek(date), 'yyyy-MM-dd');
    const monthStr = format(startOfMonth(date), 'yyyy-MM');
    
    // Get currency symbol
    let currency = (tx.tokenSymbol || '').toUpperCase();
    let displayCurrency = currency;
    
    // For price lookup, use WETH for ETH
    if (currency === 'ETH') {
      currency = 'WETH';
    }
    
    if (!currency) {
      console.warn(`⚠️ Transaction has no currency symbol: ${tx.hash}`);
      return;
    }
    
    const value = parseTransactionValue(tx.value, tx.tokenDecimal || 18);
    const price = prices[currency] || 0;
    if (price === 0) {
      console.warn(`⚠️ No price found for currency: ${currency}`);
    }
    const valueUSD = value * price;
    
    // Simple classification: all transactions are sales for now
    // TODO: Add proper transaction classification based on method signatures
    const feeCategory = displayCurrency === 'USDC' ? 'sales_usdc' : 
                       displayCurrency === 'WETH' || displayCurrency === 'ETH' ? 'sales_weth' : 
                       'uncategorized';

    // Initialize period data if needed
    if (!daily[dateStr]) daily[dateStr] = createEmptyPeriodData();
    if (!weekly[weekStr]) weekly[weekStr] = createEmptyPeriodData();
    if (!monthly[monthStr]) monthly[monthStr] = createEmptyPeriodData();

    // Update period data
    [
      { period: daily[dateStr], name: 'daily' },
      { period: weekly[weekStr], name: 'weekly' }, 
      { period: monthly[monthStr], name: 'monthly' }
    ].forEach(({ period }) => {
      period.total += value;
      period.totalUSD += valueUSD;
      period.currencies[displayCurrency] = (period.currencies[displayCurrency] || 0) + value;
      period.currenciesUSD[displayCurrency] = (period.currenciesUSD[displayCurrency] || 0) + valueUSD;
      period.byCategory[feeCategory].total += value;
      period.byCategory[feeCategory].totalUSD += valueUSD;
    });

    // Update totals
    currencyTotals[displayCurrency] = (currencyTotals[displayCurrency] || 0) + value;
    currencyTotalsUSD[displayCurrency] = (currencyTotalsUSD[displayCurrency] || 0) + valueUSD;
    categoryTotals[feeCategory].total += value;
    categoryTotals[feeCategory].totalUSD += valueUSD;
    categoryTotals[feeCategory].count += 1;
  });

  // Create currency breakdown with percentages
  const totalAllCurrenciesUSD = Object.values(currencyTotalsUSD).reduce((sum, val) => sum + val, 0);
  const currencyBreakdown: { [currency: string]: { total: number; totalUSD: number; percentage: number } } = {};
  
  // Calculate category percentages
  const totalCategoriesUSD = Object.values(categoryTotals).reduce((sum, cat) => sum + cat.totalUSD, 0);
  
  Object.keys(currencyTotals).forEach(currency => {
    const totalUSD = currencyTotalsUSD[currency] || 0;
    currencyBreakdown[currency] = {
      total: currencyTotals[currency],
      totalUSD: totalUSD,
      percentage: totalAllCurrenciesUSD > 0 ? (totalUSD / totalAllCurrenciesUSD) * 100 : 0,
    };
  });

  console.log(`✅ Aggregation complete: $${totalAllCurrenciesUSD.toFixed(2)} total`);

  // Add percentages to category breakdown
  const categoryBreakdownWithPercentages = {
    loan_usdc: {
      ...categoryTotals.loan_usdc,
      percentage: totalCategoriesUSD > 0 ? (categoryTotals.loan_usdc.totalUSD / totalCategoriesUSD) * 100 : 0
    },
    loan_weth: {
      ...categoryTotals.loan_weth,
      percentage: totalCategoriesUSD > 0 ? (categoryTotals.loan_weth.totalUSD / totalCategoriesUSD) * 100 : 0
    },
    sales_usdc: {
      ...categoryTotals.sales_usdc,
      percentage: totalCategoriesUSD > 0 ? (categoryTotals.sales_usdc.totalUSD / totalCategoriesUSD) * 100 : 0
    },
    sales_weth: {
      ...categoryTotals.sales_weth,
      percentage: totalCategoriesUSD > 0 ? (categoryTotals.sales_weth.totalUSD / totalCategoriesUSD) * 100 : 0
    },
  };

  return {
    daily,
    weekly,
    monthly,
    currencyBreakdown,
    categoryBreakdown: categoryBreakdownWithPercentages,
  };
}