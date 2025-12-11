import { NextResponse } from 'next/server';

// Health check endpoint to verify API key and environment
export async function GET() {
  const hasApiKey = !!process.env.ETHERSCAN_API_KEY;
  const isProduction = process.env.VERCEL === '1';
  const nodeEnv = process.env.NODE_ENV;
  
  return NextResponse.json({
    status: 'ok',
    version: '2025-01-11-v2', // Version identifier for debugging
    commitHash: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'local',
    buildId: process.env.VERCEL ? (process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'unknown') : 'local',
    environment: {
      hasApiKey,
      isProduction,
      nodeEnv,
      vercelEnv: process.env.VERCEL_ENV || 'local',
      vercelUrl: process.env.VERCEL_URL || 'local',
      gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'local',
    },
    message: hasApiKey 
      ? 'API key is configured'
      : '⚠️ ETHERSCAN_API_KEY is not set. Please add it in Vercel environment variables.',
    timestamp: new Date().toISOString()
  });
}
