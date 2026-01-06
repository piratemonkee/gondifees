export type TransactionType = 'loan' | 'sales' | 'unknown';
export type FeeCategory = 'loan_usdc' | 'loan_weth' | 'sales_usdc' | 'sales_weth' | 'uncategorized';

export interface TransactionEvent {
  eventName: string;
  signature: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

export interface Transaction {
  hash: string;
  timestamp: number;
  value: string;
  tokenSymbol?: string;
  tokenDecimal?: number;
  from: string;
  to: string;
  network: 'ethereum' | 'hyperevm';
  blockNumber?: number; // Block number for incremental fetching
  transactionType?: TransactionType; // Classification based on method
  feeCategory?: FeeCategory; // Specific fee category (loan_usdc, loan_weth, sales_usdc, sales_weth)
  method?: string; // Transaction method name from Etherscan
  rawValue?: number; // Parsed numeric value for easier calculations
  isInternalETH?: boolean; // Flag for internal ETH transactions (always sales fees)
}

export interface FeeData {
  date: string;
  total: number;
  currency: string;
  network: 'ethereum' | 'hyperevm';
}

interface FeePeriodData {
  total: number;
  totalUSD: number;
  currencies: { [currency: string]: number };
  currenciesUSD: { [currency: string]: number };
  byCategory: {
    loan_usdc: { total: number; totalUSD: number };
    loan_weth: { total: number; totalUSD: number };
    sales_usdc: { total: number; totalUSD: number };
    sales_weth: { total: number; totalUSD: number }; // Includes all ETH fees
  };
}

export interface AggregatedFees {
  daily: { [date: string]: FeePeriodData };
  weekly: { [week: string]: FeePeriodData };
  monthly: { [month: string]: FeePeriodData };
  currencyBreakdown: { [currency: string]: { total: number; totalUSD: number; percentage: number } };
  categoryBreakdown: {
    loan_usdc: { total: number; totalUSD: number; percentage: number; count: number };
    loan_weth: { total: number; totalUSD: number; percentage: number; count: number };
    sales_usdc: { total: number; totalUSD: number; percentage: number; count: number };
    sales_weth: { total: number; totalUSD: number; percentage: number; count: number };
  };
}

