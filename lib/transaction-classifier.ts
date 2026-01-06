import { Transaction, TransactionType, FeeCategory } from './types';

// Method names from Etherscan for different transaction types
const LOAN_METHODS = [
  'emit loan',           // New loan originations
  'repay loan',          // Loan repayments  
  'refinance full',      // Full refinancing
  'refinance tranche',   // Tranche refinancing
  'refinance',           // General refinancing
  'smart migrate',       // Smart migration fees
];

const SALES_METHODS = [
  'buy',                 // Buy method
  'sell',                // Sell method
  'execute sell',        // Execute sell
];

/**
 * Classify transaction based on method name from Etherscan
 */
export function classifyTransactionByMethod(transaction: Transaction): TransactionType {
  if (!transaction.method) {
    // If no method available, check if it's internal ETH (always sales)
    if (transaction.isInternalETH) {
      return 'sales';
    }
    return 'unknown';
  }
  
  const method = transaction.method.toLowerCase().trim();
  
  // Check for loan methods
  for (const loanMethod of LOAN_METHODS) {
    if (method.includes(loanMethod.toLowerCase())) {
      return 'loan';
    }
  }
  
  // Check for sales methods
  for (const salesMethod of SALES_METHODS) {
    if (method.includes(salesMethod.toLowerCase())) {
      return 'sales';
    }
  }
  
  // Internal ETH transactions are always sales fees
  if (transaction.isInternalETH) {
    return 'sales';
  }
  
  return 'unknown';
}

/**
 * Determine the specific fee category based on transaction type and token
 */
export function getFeeCategory(transaction: Transaction): FeeCategory {
  const transactionType = transaction.transactionType || classifyTransactionByMethod(transaction);
  const tokenSymbol = (transaction.tokenSymbol || '').toUpperCase();
  
  // Normalize token symbols - treat ETH and WETH the same, and map network-specific tokens
  let normalizedToken = tokenSymbol;
  if (tokenSymbol === 'ETH' || tokenSymbol === 'WETH' || tokenSymbol === 'WHYPE') {
    normalizedToken = 'WETH';
  } else if (tokenSymbol === 'USDC' || tokenSymbol === 'HUSDC') {
    normalizedToken = 'USDC';
  }
  
  // Internal ETH is always sales_weth
  if (transaction.isInternalETH) {
    return 'sales_weth';
  }
  
  // Map transaction type + token to fee category
  if (transactionType === 'loan') {
    return normalizedToken === 'USDC' ? 'loan_usdc' : 'loan_weth';
  } else if (transactionType === 'sales') {
    return normalizedToken === 'USDC' ? 'sales_usdc' : 'sales_weth';
  }
  
  // For unknown transaction types, categorize as uncategorized
  if (transactionType === 'unknown') {
    return 'uncategorized';
  }
  
  // Default fallback based on token type
  return normalizedToken === 'USDC' ? 'sales_usdc' : 'sales_weth';
}

/**
 * Classify all transactions in a batch
 */
export function classifyTransactions(transactions: Transaction[]): Transaction[] {
  console.log(`🔍 Classifying ${transactions.length} transactions by method...`);
  
  const classified = transactions.map(transaction => {
    const transactionType = classifyTransactionByMethod(transaction);
    const feeCategory = getFeeCategory({ ...transaction, transactionType });
    
    return {
      ...transaction,
      transactionType,
      feeCategory,
    };
  });
  
  // Log classification summary
  const typeCount = classified.reduce((acc, tx) => {
    const type = tx.transactionType || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const categoryCount = classified.reduce((acc, tx) => {
    const category = tx.feeCategory || 'unknown';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('📊 Transaction type summary:', typeCount);
  console.log('📊 Fee category summary:', categoryCount);
  
  return classified;
}

/**
 * Extract method name from transaction input data or use heuristics
 * This is a placeholder - in reality we'd need to decode the transaction input
 */
export function extractMethodFromTransaction(transaction: Transaction): string | undefined {
  // For now, we'll use heuristics based on value patterns since we don't have
  // access to the transaction input data in the current API calls
  // This would be replaced with actual method extraction from transaction data
  
  const rawValue = transaction.rawValue || 0;
  const tokenSymbol = (transaction.tokenSymbol || '').toUpperCase();
  
  // Heuristic classification based on patterns
  // Large WETH amounts likely from loans
  if (tokenSymbol === 'WETH' && rawValue > 5) {
    return 'emit loan'; // Likely loan origination
  }
  
  // Medium WETH amounts could be loan repayments
  if (tokenSymbol === 'WETH' && rawValue > 0.5 && rawValue <= 5) {
    return 'repay loan';
  }
  
  // Large USDC amounts likely loans
  if (tokenSymbol === 'USDC' && rawValue > 5000) {
    return 'emit loan';
  }
  
  // Medium USDC amounts could be refinancing
  if (tokenSymbol === 'USDC' && rawValue > 1000 && rawValue <= 5000) {
    return 'refinance';
  }
  
  // Smaller amounts likely sales
  if (rawValue < 1000) {
    return 'buy';
  }
  
  return undefined;
}

/**
 * Enhanced classification that tries to extract method names when available
 */
export function enhanceTransactionClassification(transactions: Transaction[]): Transaction[] {
  console.log('🔍 Enhancing transaction classification with method detection...');
  
  return transactions.map(transaction => {
    // Try to extract method if not already available
    let method = transaction.method;
    if (!method) {
      method = extractMethodFromTransaction(transaction);
    }
    
    const enhancedTransaction = {
      ...transaction,
      method,
      rawValue: transaction.rawValue || parseFloat(transaction.value) / (10 ** (transaction.tokenDecimal || 18)),
    };
    
    // Classify based on method
    const transactionType = classifyTransactionByMethod(enhancedTransaction);
    const feeCategory = getFeeCategory({ ...enhancedTransaction, transactionType });
    
    return {
      ...enhancedTransaction,
      transactionType,
      feeCategory,
    };
  });
}