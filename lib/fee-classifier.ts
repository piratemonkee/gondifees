/**
 * Simple fee type classifier based on transaction input data
 */

export type FeeType = 'loan' | 'sale' | 'unknown';

/**
 * Classify fee type from transaction input data
 * Loan: refinanceFromLoanExecutionData (0x761976ea)
 * Sale: executeSell (0x8b661592)
 */
export function classifyFeeType(inputData: string | null | undefined): FeeType {
  if (!inputData || !inputData.startsWith('0x')) {
    return 'unknown';
  }
  
  const functionSig = inputData.substring(0, 10).toLowerCase();
  
  if (functionSig === '0x8b661592') {
    return 'sale'; // executeSell
  }
  
  if (functionSig === '0x761976ea') {
    return 'loan'; // refinanceFromLoanExecutionData
  }
  
  return 'unknown';
}

/**
 * Fetch transaction input data from Etherscan API
 */
export async function fetchTransactionInputData(
  txHash: string,
  chainId: number,
  apiKey?: string
): Promise<string | null> {
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=proxy&action=eth_getTransactionByHash&txhash=${txHash}${apiKey ? `&apikey=${apiKey}` : ''}`;
    const response = await fetch(url);
    const data = await response.json();
    return data.result?.input || null;
  } catch (error) {
    console.warn(`Failed to fetch input for ${txHash}:`, error);
    return null;
  }
}
