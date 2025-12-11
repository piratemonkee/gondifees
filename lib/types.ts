export interface Transaction {
  hash: string;
  timestamp: number;
  value: string;
  tokenSymbol?: string;
  tokenDecimal?: number;
  from: string;
  to: string;
  network: 'ethereum' | 'hyperevm';
}

export interface FeeData {
  date: string;
  total: number;
  currency: string;
  network: 'ethereum' | 'hyperevm';
}

export interface AggregatedFees {
  daily: { [date: string]: { total: number; totalUSD: number; currencies: { [currency: string]: number }; currenciesUSD: { [currency: string]: number } } };
  weekly: { [week: string]: { total: number; totalUSD: number; currencies: { [currency: string]: number }; currenciesUSD: { [currency: string]: number } } };
  monthly: { [month: string]: { total: number; totalUSD: number; currencies: { [currency: string]: number }; currenciesUSD: { [currency: string]: number } } };
  currencyBreakdown: { [currency: string]: { total: number; totalUSD: number; percentage: number } };
}

