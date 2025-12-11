#!/usr/bin/env node

/**
 * Helper script to guide users through getting an Etherscan API key
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n🔑 GONDI Fees Dashboard - API Key Setup\n');
console.log('To fetch real blockchain data, you need a free Etherscan API key.\n');

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  try {
    // Check if API key already exists
    const envPath = path.join(process.cwd(), '.env.local');
    let existingKey = '';
    
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/ETHERSCAN_API_KEY=(.+)/);
      if (match && match[1] && match[1].trim() !== '') {
        existingKey = match[1].trim();
        console.log('✅ Found existing API key in .env.local\n');
        const useExisting = await question('Do you want to use the existing key? (y/n): ');
        if (useExisting.toLowerCase() === 'y') {
          console.log('\n✅ Using existing API key. Restart your dev server to apply changes.\n');
          rl.close();
          return;
        }
      }
    }

    console.log('📋 Steps to get your free API key:');
    console.log('   1. Visit: https://etherscan.io/register');
    console.log('   2. Create a free account (or login if you have one)');
    console.log('   3. Go to: https://etherscan.io/myapikey');
    console.log('   4. Click "Add" to create a new API key');
    console.log('   5. Copy your API key\n');

    const openBrowser = await question('Would you like to open the API key page in your browser? (y/n): ');
    
    if (openBrowser.toLowerCase() === 'y') {
      const platform = process.platform;
      let command;
      
      if (platform === 'darwin') {
        command = 'open';
      } else if (platform === 'win32') {
        command = 'start';
      } else {
        command = 'xdg-open';
      }
      
      exec(`${command} https://etherscan.io/myapikey`, (error) => {
        if (error) {
          console.log('\n⚠️  Could not open browser automatically. Please visit: https://etherscan.io/myapikey\n');
        }
      });
    }

    console.log('\n');
    const apiKey = await question('Paste your API key here (or press Enter to skip): ');
    
    if (apiKey && apiKey.trim() !== '') {
      // Write to .env.local
      const envContent = `# Etherscan API Key (optional but recommended for better rate limits)
# Get your free API key at: https://etherscan.io/apis
ETHERSCAN_API_KEY=${apiKey.trim()}
`;
      
      fs.writeFileSync(envPath, envContent);
      console.log('\n✅ API key saved to .env.local');
      console.log('🔄 Please restart your development server (npm run dev) for changes to take effect.\n');
    } else {
      console.log('\n⚠️  No API key provided. The app will run but may not be able to fetch data.');
      console.log('   You can add it later by editing .env.local\n');
    }
    
    rl.close();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    rl.close();
    process.exit(1);
  }
}

main();

