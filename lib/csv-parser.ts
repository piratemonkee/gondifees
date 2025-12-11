import { Transaction } from './types';

const ETHEREUM_FEE_ADDRESS = '0x4169447a424ec645f8a24dccfd8328f714dd5562';
const HYPEREVM_FEE_ADDRESS = '0xbc0b9c63dc0581278d4b554af56858298bf2a9ec';

export function parseCSVTransactions(csvContent: string, network: 'ethereum' | 'hyperevm' = 'ethereum'): Transaction[] {
  const lines = csvContent.trim().split('\n');
  const transactions: Transaction[] = [];
  const feeAddress = network === 'ethereum' ? ETHEREUM_FEE_ADDRESS : HYPEREVM_FEE_ADDRESS;
  
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV line (handling quoted values)
    const values = parseCSVLine(line);
    
    if (values.length < 11) continue;
    
    const [
      txHash,
      blockNo,
      unixTimestamp,
      dateTime,
      from,
      to,
      tokenValue, // Already in human-readable format!
      usdValue,
      contractAddress,
      tokenName,
      tokenSymbol
    ] = values;
    
    // Only process transactions TO the fee address
    if (to.toLowerCase() !== feeAddress.toLowerCase()) {
      continue;
    }
    
    // Determine currency symbol based on network and token
    let symbol = tokenSymbol.toUpperCase();
    let decimals = 18;
    
    if (network === 'ethereum') {
      // Ethereum: Only USDC and WETH
      if (symbol !== 'USDC' && symbol !== 'WETH') {
        continue;
      }
      decimals = symbol === 'USDC' ? 6 : 18;
    } else {
      // HyperEVM: USDC becomes HUSDC, WHYPE stays WHYPE
      if (symbol === 'USDC') {
        symbol = 'HUSDC'; // Tag HyperEVM USDC as HUSDC
        decimals = 6;
      } else if (symbol === 'WHYPE' || symbol === 'WRHYPER' || tokenName?.toUpperCase().includes('WRAP')) {
        symbol = 'WHYPE';
        decimals = 18;
      } else {
        continue; // Skip other tokens
      }
    }
    
    // Parse token value (already in human-readable format, may have commas)
    const cleanValue = tokenValue.replace(/"/g, '').replace(/,/g, '');
    const value = parseFloat(cleanValue);
    if (isNaN(value) || value <= 0) {
      continue;
    }
    
    // Convert to wei format for consistency with our system
    // Use more precise calculation to avoid precision loss
    const valueInWei = BigInt(Math.floor(value * (10 ** decimals) + 0.5));
    
    // Parse timestamp (Unix timestamp in seconds, convert to milliseconds)
    const timestamp = parseInt(unixTimestamp.replace(/"/g, '')) * 1000;
    
    transactions.push({
      hash: txHash.replace(/"/g, ''),
      timestamp,
      value: valueInWei.toString(),
      tokenSymbol: symbol,
      tokenDecimal: decimals,
      from: from.replace(/"/g, ''),
      to: to.replace(/"/g, ''),
      network,
    });
  }
  
  return transactions;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last value
  values.push(current);
  
  return values;
}

