import { NextResponse } from 'next/server';

// Health check endpoint to verify API key and environment
export async function GET() {
  const hasApiKey = !!process.env.ETHERSCAN_API_KEY;
  const isProduction = process.env.VERCEL === '1';
  const nodeEnv = process.env.NODE_ENV;
  
  return NextResponse.json({
    status: 'ok',
    environment: {
      hasApiKey,
      isProduction,
      nodeEnv,
      vercelEnv: process.env.VERCEL_ENV || 'unknown'
    },
    message: hasApiKey 
      ? 'API key is configured'
      : '⚠️ ETHERSCAN_API_KEY is not set. Please add it in Vercel environment variables.'
  });
}
