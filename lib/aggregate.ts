import { Transaction, AggregatedFees } from './types';
import { parseTransactionValue } from './blockchain';
import { format, startOfWeek, startOfMonth } from 'date-fns';
import { getMultipleTokenPrices } from './prices';

export async function aggregateFees(transactions: Transaction[]): Promise<AggregatedFees> {
  const daily: { [date: string]: { total: number; totalUSD: number; currencies: { [currency: string]: number }; currenciesUSD: { [currency: string]: number } } } = {};
  const weekly: { [week: string]: { total: number; totalUSD: number; currencies: { [currency: string]: number }; currenciesUSD: { [currency: string]: number } } } = {};
  const monthly: { [month: string]: { total: number; totalUSD: number; currencies: { [currency: string]: number }; currenciesUSD: { [currency: string]: number } } } = {};
  const currencyTotals: { [currency: string]: number } = {};
  const currencyTotalsUSD: { [currency: string]: number } = {};

  // Filter transactions from Oct 22, 2025 onwards
  // Accept: USDC, WETH (Ethereum), HUSDC, WHYPE (HyperEVM)
  const firstFeeTimestamp = new Date('2025-10-22T00:00:00Z').getTime();
  const filteredTransactions = transactions.filter(tx => {
    const symbol = (tx.tokenSymbol || '').toUpperCase();
    const isValidToken = ['USDC', 'WETH', 'HUSDC', 'WHYPE'].includes(symbol);
    const isValidDate = tx.timestamp >= firstFeeTimestamp;
    return isValidToken && isValidDate;
  });
  
  console.log(`Filtered ${filteredTransactions.length} transactions from Oct 22, 2025 onwards (out of ${transactions.length} total)`);

  // Get all unique currencies
  const currencies = new Set<string>();
  filteredTransactions.forEach(tx => {
    const symbol = (tx.tokenSymbol || '').toUpperCase();
    if (['USDC', 'WETH', 'HUSDC', 'WHYPE'].includes(symbol)) {
      currencies.add(symbol);
    }
  });
  
  console.log('Currencies found:', Array.from(currencies));

  // Fetch prices for all currencies
  const prices = await getMultipleTokenPrices(Array.from(currencies));
  
  console.log('Token prices:', prices);

  filteredTransactions.forEach(tx => {
    const date = new Date(tx.timestamp);
    const dateStr = format(date, 'yyyy-MM-dd');
    const weekStr = format(startOfWeek(date), 'yyyy-MM-dd');
    const monthStr = format(startOfMonth(date), 'yyyy-MM');
    
    // Normalize currency to uppercase to match prices object keys
    const currency = (tx.tokenSymbol || '').toUpperCase();
    if (!currency || !['USDC', 'WETH', 'HUSDC', 'WHYPE'].includes(currency)) {
      console.warn(`Skipping transaction with invalid currency: ${tx.tokenSymbol}`);
      return;
    }
    const value = parseTransactionValue(tx.value, tx.tokenDecimal || 18);
    const price = prices[currency] || 0;
    if (price === 0) {
      console.warn(`Price not found for currency: ${currency}`);
    }
    const valueUSD = value * price;

    // Daily aggregation
    if (!daily[dateStr]) {
      daily[dateStr] = { total: 0, totalUSD: 0, currencies: {}, currenciesUSD: {} };
    }
    daily[dateStr].total += value;
    daily[dateStr].totalUSD += valueUSD;
    daily[dateStr].currencies[currency] = (daily[dateStr].currencies[currency] || 0) + value;
    daily[dateStr].currenciesUSD[currency] = (daily[dateStr].currenciesUSD[currency] || 0) + valueUSD;

    // Weekly aggregation
    if (!weekly[weekStr]) {
      weekly[weekStr] = { total: 0, totalUSD: 0, currencies: {}, currenciesUSD: {} };
    }
    weekly[weekStr].total += value;
    weekly[weekStr].totalUSD += valueUSD;
    weekly[weekStr].currencies[currency] = (weekly[weekStr].currencies[currency] || 0) + value;
    weekly[weekStr].currenciesUSD[currency] = (weekly[weekStr].currenciesUSD[currency] || 0) + valueUSD;

    // Monthly aggregation
    if (!monthly[monthStr]) {
      monthly[monthStr] = { total: 0, totalUSD: 0, currencies: {}, currenciesUSD: {} };
    }
    monthly[monthStr].total += value;
    monthly[monthStr].totalUSD += valueUSD;
    monthly[monthStr].currencies[currency] = (monthly[monthStr].currencies[currency] || 0) + value;
    monthly[monthStr].currenciesUSD[currency] = (monthly[monthStr].currenciesUSD[currency] || 0) + valueUSD;

    // Currency totals
    currencyTotals[currency] = (currencyTotals[currency] || 0) + value;
    currencyTotalsUSD[currency] = (currencyTotalsUSD[currency] || 0) + valueUSD;
  });

  // Calculate total and percentages for currency breakdown
  const grandTotalUSD = Object.values(currencyTotalsUSD).reduce((sum, val) => sum + val, 0);
  const currencyBreakdown: { [currency: string]: { total: number; totalUSD: number; percentage: number } } = {};
  
  Object.entries(currencyTotals).forEach(([currency, total]) => {
    currencyBreakdown[currency] = {
      total,
      totalUSD: currencyTotalsUSD[currency] || 0,
      percentage: grandTotalUSD > 0 ? ((currencyTotalsUSD[currency] || 0) / grandTotalUSD) * 100 : 0,
    };
  });

  // Log totals for debugging
  console.log('Currency totals (native):', currencyTotals);
  console.log('Currency totals (USD):', currencyTotalsUSD);
  console.log('Grand total USD:', grandTotalUSD);
  console.log('Total transactions processed:', filteredTransactions.length);
  
  // Log breakdown by currency for verification
  Object.entries(currencyTotals).forEach(([currency, total]) => {
    const usdTotal = currencyTotalsUSD[currency] || 0;
    const price = prices[currency] || 0;
    console.log(`${currency}: ${total.toFixed(6)} tokens, price: $${price}, USD total: $${usdTotal.toFixed(2)}`);
  });

  return {
    daily,
    weekly,
    monthly,
    currencyBreakdown,
  };
}

