// System to track last processed transaction for incremental updates
// Works on both client and server side

export interface LastProcessedTransaction {
  network: 'ethereum' | 'hyperevm';
  blockNumber: number;
  timestamp: number;
  hash: string;
  lastUpdated: string; // ISO timestamp
}

export interface LastProcessedData {
  ethereum?: LastProcessedTransaction;
  hyperevm?: LastProcessedTransaction;
}

const STORAGE_KEY = 'gondi-last-processed';

// Server-side storage (in-memory, will be lost on restart - in production use a database)
let serverStorage: LastProcessedData = {};

/**
 * Get storage - works on both client and server
 */
function getStorage(): LastProcessedData {
  if (typeof window !== 'undefined') {
    // Client-side: use localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (err) {
      console.error('Error reading from localStorage:', err);
    }
  } else {
    // Server-side: use in-memory storage
    return serverStorage;
  }
  return {};
}

/**
 * Set storage - works on both client and server
 */
function setStorage(data: LastProcessedData): void {
  if (typeof window !== 'undefined') {
    // Client-side: use localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('Error writing to localStorage:', err);
    }
  } else {
    // Server-side: use in-memory storage
    serverStorage = data;
  }
}

/**
 * Get the last processed transaction for a network
 */
export function getLastProcessedTransaction(network: 'ethereum' | 'hyperevm'): LastProcessedTransaction | null {
  try {
    const data = getStorage();
    return data[network] || null;
  } catch (err) {
    console.error('Error reading last processed transaction:', err);
    return null;
  }
}

/**
 * Update the last processed transaction for a network
 */
export function updateLastProcessedTransaction(
  network: 'ethereum' | 'hyperevm',
  blockNumber: number,
  timestamp: number,
  hash: string
): void {
  try {
    const data = getStorage();
    
    data[network] = {
      network,
      blockNumber,
      timestamp,
      hash,
      lastUpdated: new Date().toISOString(),
    };
    
    setStorage(data);
    console.log(`✅ Updated last processed transaction for ${network}: block ${blockNumber}, hash ${hash.slice(0, 10)}...`);
  } catch (err) {
    console.error('Error updating last processed transaction:', err);
  }
}

/**
 * Get the start block number for incremental fetching
 * Returns the block number AFTER the last processed transaction, or 0 if no last processed transaction
 */
export function getStartBlock(network: 'ethereum' | 'hyperevm'): number {
  const lastProcessed = getLastProcessedTransaction(network);
  if (!lastProcessed) {
    console.log(`📊 No last processed transaction for ${network}, starting from block 0`);
    return 0;
  }
  
  // Start from the block AFTER the last processed one
  const startBlock = lastProcessed.blockNumber + 1;
  console.log(`📊 Last processed ${network} transaction: block ${lastProcessed.blockNumber}, starting from block ${startBlock}`);
  return startBlock;
}

/**
 * Find the latest transaction (highest block number) from a list of transactions
 */
export function findLatestTransaction(transactions: Array<{ blockNumber?: number; hash: string; timestamp: number }>): {
  blockNumber: number;
  hash: string;
  timestamp: number;
} | null {
  if (transactions.length === 0) return null;
  
  // Filter transactions with block numbers and find the one with highest block
  const transactionsWithBlocks = transactions.filter(tx => tx.blockNumber !== undefined);
  if (transactionsWithBlocks.length === 0) return null;
  
  const latest = transactionsWithBlocks.reduce((latest, current) => {
    if (!current.blockNumber) return latest;
    if (!latest || !latest.blockNumber) return current;
    return current.blockNumber > latest.blockNumber ? current : latest;
  });
  
  if (!latest.blockNumber) return null;
  
  return {
    blockNumber: latest.blockNumber,
    hash: latest.hash,
    timestamp: latest.timestamp,
  };
}

/**
 * Clear last processed transactions (useful for full refresh)
 */
export function clearLastProcessedTransactions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('✅ Cleared last processed transactions');
  } catch (err) {
    console.error('Error clearing last processed transactions:', err);
  }
}
