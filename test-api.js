#!/usr/bin/env node
/**
 * Test script to verify API fetching is working correctly
 * Run with: node test-api.js
 */

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '1GF56R2J7PIEGJ2W4885DD5583NFCMYXDR';
const ETHEREUM_ADDRESS = '0x4169447a424ec645f8a24dccfd8328f714dd5562';
const HYPEREVM_ADDRESS = '0xbc0b9c63dc0581278d4b554af56858298bf2a9ec';

async function testEthereumAPI() {
  console.log('\n=== Testing Ethereum API (V2) ===');
  const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&address=${ETHEREUM_ADDRESS}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`Status: ${data.status}`);
    console.log(`Message: ${data.message}`);
    
    if (data.status === '1' && Array.isArray(data.result)) {
      const results = data.result;
      console.log(`✅ Successfully fetched ${results.length} transactions`);
      
      // Filter for USDC and WETH only
      const filtered = results.filter(tx => {
        const symbol = (tx.tokenSymbol || '').toUpperCase();
        const isToAddress = tx.to && tx.to.toLowerCase() === ETHEREUM_ADDRESS.toLowerCase();
        return isToAddress && (symbol === 'USDC' || symbol === 'WETH');
      });
      
      console.log(`✅ Filtered to ${filtered.length} USDC/WETH transactions TO fee address`);
      
      // Count by token
      const byToken = {};
      filtered.forEach(tx => {
        const symbol = (tx.tokenSymbol || '').toUpperCase();
        byToken[symbol] = (byToken[symbol] || 0) + 1;
      });
      console.log('Breakdown:', byToken);
      
      // Check date filtering (Oct 22, 2025 onwards)
      const firstFeeTimestamp = new Date('2025-10-22T00:00:00Z').getTime();
      const dateFiltered = filtered.filter(tx => {
        const timestamp = parseInt(tx.timeStamp) * 1000;
        return timestamp >= firstFeeTimestamp;
      });
      console.log(`✅ ${dateFiltered.length} transactions from Oct 22, 2025 onwards`);
      
      return { success: true, count: dateFiltered.length };
    } else {
      console.log('❌ API returned error or no results');
      console.log('Response:', JSON.stringify(data, null, 2).substring(0, 500));
      return { success: false, error: data.message };
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function testHyperEVMAPI() {
  console.log('\n=== Testing HyperEVM API (Etherscan V2, chainid=999) ===');
  const url = `https://api.etherscan.io/v2/api?chainid=999&module=account&action=tokentx&address=${HYPEREVM_ADDRESS}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`Status: ${data.status}`);
    console.log(`Message: ${data.message}`);
    
    if (data.status === '1' && Array.isArray(data.result)) {
      const results = data.result;
      console.log(`✅ Successfully fetched ${results.length} transactions`);
      
      // Filter for HUSDC and WHYPE only
      const filtered = results.filter(tx => {
        const symbol = (tx.tokenSymbol || '').toUpperCase();
        const tokenName = (tx.tokenName || '').toUpperCase();
        const isToAddress = tx.to && tx.to.toLowerCase() === HYPEREVM_ADDRESS.toLowerCase();
        const isUSDC = symbol === 'USDC';
        const isWHYPE = symbol === 'WHYPE' || symbol === 'WRHYPER' || 
                       tokenName.includes('WRAP') || tokenName.includes('HYPE');
        return isToAddress && (isUSDC || isWHYPE);
      });
      
      console.log(`✅ Filtered to ${filtered.length} HUSDC/WHYPE transactions TO fee address`);
      
      // Count by token
      const byToken = {};
      filtered.forEach(tx => {
        let symbol = (tx.tokenSymbol || '').toUpperCase();
        if (symbol === 'USDC') symbol = 'HUSDC';
        else if (symbol === 'WRHYPER' || (tx.tokenName || '').toUpperCase().includes('WRAP')) symbol = 'WHYPE';
        byToken[symbol] = (byToken[symbol] || 0) + 1;
      });
      console.log('Breakdown:', byToken);
      
      // Check date filtering (Oct 22, 2025 onwards)
      const firstFeeTimestamp = new Date('2025-10-22T00:00:00Z').getTime();
      const dateFiltered = filtered.filter(tx => {
        const timestamp = parseInt(tx.timeStamp) * 1000;
        return timestamp >= firstFeeTimestamp;
      });
      console.log(`✅ ${dateFiltered.length} transactions from Oct 22, 2025 onwards`);
      
      return { success: true, count: dateFiltered.length };
    } else {
      console.log('❌ API returned error');
      console.log('Response:', JSON.stringify(data, null, 2).substring(0, 500));
      return { success: false, error: data.message || 'Unknown error' };
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function testFullAPI() {
  console.log('\n=== Testing Full API Endpoint ===');
  try {
    const response = await fetch('http://localhost:3000/api/fees?forceApi=true');
    const data = await response.json();
    
    if (data.success) {
      console.log(`✅ API endpoint working`);
      console.log(`Total Transactions: ${data.stats.totalTransactions}`);
      console.log(`Ethereum: ${data.stats.ethereumTransactions}`);
      console.log(`HyperEVM: ${data.stats.hyperevmTransactions}`);
      console.log(`Is Demo: ${data.isDemo}`);
      
      if (data.data && data.data.currencyBreakdown) {
        console.log('\nCurrency Breakdown:');
        Object.entries(data.data.currencyBreakdown).forEach(([currency, breakdown]) => {
          console.log(`  ${currency}: $${breakdown.totalUSD.toFixed(2)} USD`);
        });
        const total = Object.values(data.data.currencyBreakdown).reduce((sum, b) => sum + b.totalUSD, 0);
        console.log(`\nGrand Total: $${total.toFixed(2)} USD`);
      }
      
      return { success: true };
    } else {
      console.log('❌ API endpoint returned error:', data.error);
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('Make sure the dev server is running: npm run dev');
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🧪 Testing GONDI Fees API Integration\n');
  
  const ethResult = await testEthereumAPI();
  const hyperevmResult = await testHyperEVMAPI();
  const fullResult = await testFullAPI();
  
  console.log('\n=== Summary ===');
  console.log(`Ethereum API: ${ethResult.success ? '✅ Working' : '❌ Failed'}`);
  console.log(`HyperEVM API: ${hyperevmResult.success ? '✅ Working' : '⚠️  ' + hyperevmResult.error}`);
  console.log(`Full API: ${fullResult.success ? '✅ Working' : '❌ Failed'}`);
  
  if (ethResult.success && fullResult.success) {
    console.log('\n✅ API integration is working correctly!');
    console.log('You can now click "Update" in the browser to fetch real data.');
  } else {
    console.log('\n⚠️  Some issues detected. Check the errors above.');
  }
}

main().catch(console.error);
