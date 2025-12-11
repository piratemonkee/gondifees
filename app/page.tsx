'use client';

import { useEffect, useState } from 'react';
import { AggregatedFees } from '@/lib/types';
import { format } from 'date-fns';
import { parseTransactionValue } from '@/lib/blockchain';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// Vercel-style monochrome palette with subtle variations
// Color palette for 4 currencies
const CURRENCY_COLORS: { [key: string]: string } = {
  'USDC': '#2775CA', // Blue (Ethereum USDC)
  'WETH': '#8B5CF6', // Purple/Violet (more distinguishable)
  'HUSDC': '#3B82F6', // Lighter blue (HyperEVM USDC)
  'WHYPE': '#10B981', // Green (HyperEVM WHYPE)
};


interface RecentTransaction {
  hash: string;
  timestamp: number;
  tokenSymbol?: string;
  value: string;
  tokenDecimal?: number;
  from: string;
  to: string;
  network: 'ethereum' | 'hyperevm';
  usdValue?: number;
}

export default function Home() {
  const [data, setData] = useState<AggregatedFees | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Monitor data changes
  useEffect(() => {
    if (data) {
      console.log('🔄 Data state updated:', {
        hasCurrencyBreakdown: !!data.currencyBreakdown,
        currencies: Object.keys(data.currencyBreakdown || {}),
        USDC: data.currencyBreakdown?.USDC?.totalUSD,
        WETH: data.currencyBreakdown?.WETH?.totalUSD,
        HUSDC: data.currencyBreakdown?.HUSDC?.totalUSD,
        WHYPE: data.currencyBreakdown?.WHYPE?.totalUSD,
      });
    }
  }, [data]);

  // Load cached data on mount, or fetch if no cache
  useEffect(() => {
    const hasCache = loadCachedData();
    // If no cache exists, fetch data on initial load
    if (!hasCache) {
      console.log('No cache found, fetching data on initial load...');
      fetchFees(false); // Fetch without forcing API (will use CSV in local dev)
    }
  }, []);

  // Load data from localStorage cache
  const loadCachedData = () => {
    try {
      const cached = localStorage.getItem('gondi-fees-cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        const cacheTime = new Date(parsed.timestamp);
        const now = new Date();
        const hoursSinceUpdate = (now.getTime() - cacheTime.getTime()) / (1000 * 60 * 60);
        
        // Validate cache data - check if Ethereum fees are $0 (invalid cache)
        const ethereumTotal = (parsed.data?.currencyBreakdown?.USDC?.totalUSD || 0) + 
                             (parsed.data?.currencyBreakdown?.WETH?.totalUSD || 0);
        const hasInvalidEthereumData = ethereumTotal === 0 && 
                                       (parsed.data?.currencyBreakdown?.HUSDC?.totalUSD || 0) > 0;
        
        if (hasInvalidEthereumData) {
          console.warn('⚠️ Cache has invalid data (Ethereum fees are $0 but HyperEVM has data). Clearing cache and fetching fresh data.');
          localStorage.removeItem('gondi-fees-cache');
          return false;
        }
        
        // Use cache if less than 24 hours old
        if (hoursSinceUpdate < 24) {
          console.log('📦 Loading from cache...');
          console.log('📦 Cached currency breakdown:', parsed.data?.currencyBreakdown);
          
          // Debug cached values
          if (parsed.data?.currencyBreakdown) {
            const cachedUSDC = parsed.data.currencyBreakdown.USDC?.totalUSD || 0;
            const cachedWETH = parsed.data.currencyBreakdown.WETH?.totalUSD || 0;
            console.log('📦 Cached USDC:', cachedUSDC);
            console.log('📦 Cached WETH:', cachedWETH);
            console.log('📦 Cached Ethereum Total:', cachedUSDC + cachedWETH);
            
            // Warn if Ethereum data looks wrong
            if (cachedUSDC === 0 && cachedWETH === 0) {
              console.warn('⚠️ WARNING: Cached Ethereum fees are both $0. This might be invalid data.');
            }
          }
          
          setData(parsed.data);
          setRecentTransactions(parsed.recentTransactions || []);
          setLastUpdated(cacheTime);
          setLoading(false);
          console.log('✅ Loaded data from cache');
          return true;
        } else {
          console.log('⚠️ Cache expired, will fetch fresh data');
        }
      }
    } catch (err) {
      console.error('Error loading cache:', err);
    }
    // Don't set loading to false here - let fetchFees handle it
    return false;
  };

  // Save data to localStorage cache
  const saveToCache = (data: AggregatedFees, recentTransactions: RecentTransaction[]) => {
    try {
      const cacheData = {
        data,
        recentTransactions,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem('gondi-fees-cache', JSON.stringify(cacheData));
      console.log('✅ Saved data to cache');
    } catch (err) {
      console.error('Error saving cache:', err);
    }
  };

  const fetchFees = async (forceApi: boolean = false, isUpdate: boolean = false) => {
    try {
      // If it's an update, use isUpdating state, otherwise use loading
      if (isUpdate) {
        setIsUpdating(true);
        setUpdateMessage({ type: 'info', text: 'Fetching latest data from blockchain...' });
      } else {
        setLoading(true);
      }
      setError(null);
      
      // On initial load, don't force incremental (let server decide based on last processed data)
      // Only use incremental explicitly when user clicks Update button
      const url = forceApi ? '/api/fees?forceApi=true' : '/api/fees';
      
      const response = await fetch(url);
      
      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text.substring(0, 200));
        throw new Error(`Server returned ${response.status}: ${response.statusText}. Response is not JSON.`);
      }
      
      const result = await response.json();
      
      // Handle timeout errors
      if (result.timeout) {
        const errorMsg = result.details || 'Request timed out. The data fetch is taking too long.';
        if (isUpdate) {
          setUpdateMessage({ 
            type: 'error', 
            text: `⏱️ ${errorMsg} Try using "Full Refresh" or wait a moment.` 
          });
          setTimeout(() => setUpdateMessage(null), 8000);
        } else {
          setError(errorMsg);
        }
        return;
      }
      
      if (result.success) {
        console.log('✅ Data received from API:', {
          hasData: !!result.data,
          currencyBreakdown: result.data?.currencyBreakdown,
          stats: result.stats
        });
        
        // Debug: Log each currency value
        if (result.data?.currencyBreakdown) {
          console.log('🔍 Currency Breakdown Values:');
          console.log('  USDC:', result.data.currencyBreakdown.USDC);
          console.log('  WETH:', result.data.currencyBreakdown.WETH);
          console.log('  HUSDC:', result.data.currencyBreakdown.HUSDC);
          console.log('  WHYPE:', result.data.currencyBreakdown.WHYPE);
          
          // Calculate totals
          const ethereumTotal = (result.data.currencyBreakdown.USDC?.totalUSD || 0) + (result.data.currencyBreakdown.WETH?.totalUSD || 0);
          const hyperevmTotal = (result.data.currencyBreakdown.HUSDC?.totalUSD || 0) + (result.data.currencyBreakdown.WHYPE?.totalUSD || 0);
          console.log('  Ethereum Total:', ethereumTotal);
          console.log('  HyperEVM Total:', hyperevmTotal);
        }
        
        setData(result.data);
        setRecentTransactions(result.recentTransactions || []);
        setLastUpdated(new Date());
        setError(null);
        
        // Save to cache
        saveToCache(result.data, result.recentTransactions || []);
        
        // Show success message if updating
        if (isUpdate) {
          const txCount = result.stats?.totalTransactions || 0;
          setUpdateMessage({ 
            type: 'success', 
            text: `✅ Successfully updated! Loaded ${txCount} transactions.` 
          });
          // Clear message after 5 seconds
          setTimeout(() => setUpdateMessage(null), 5000);
        }
      } else {
        const errorMsg = result.error || 'Failed to fetch data';
        const details = result.details || '';
        const hint = result.hint || '';
        const fullError = `${errorMsg}${details ? `: ${details}` : ''}${hint ? ` (${hint})` : ''}`;
        
        if (isUpdate) {
          setUpdateMessage({ type: 'error', text: `❌ ${fullError}` });
          setTimeout(() => setUpdateMessage(null), 8000);
        } else {
          setError(fullError);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch fee data';
      
      if (isUpdate) {
        setUpdateMessage({ type: 'error', text: `❌ Network error: ${errorMsg}` });
        setTimeout(() => setUpdateMessage(null), 8000);
        
        // If we have cached data, keep showing it
        const hasCache = loadCachedData();
        if (hasCache) {
          setUpdateMessage({ type: 'info', text: '⚠️ Using cached data due to network error.' });
          setTimeout(() => setUpdateMessage(null), 5000);
        }
      } else {
        // If we have cached data, don't show error, just use cache
        const hasCache = loadCachedData();
        if (!hasCache) {
          setError(`Network error: ${errorMsg}`);
        } else {
          setError(null); // Clear error if we have cache
        }
      }
      
      console.error('Fetch error:', err);
    } finally {
      if (isUpdate) {
        setIsUpdating(false);
      } else {
        setLoading(false);
      }
    }
  };

  const handleUpdate = async (fullRefresh: boolean = false): Promise<void> => {
    setIsUpdating(true);
    setUpdateMessage({ 
      type: 'info', 
      text: fullRefresh 
        ? '🔄 Performing full refresh - fetching all transactions...' 
        : '🔄 Checking for new transactions since last update...' 
    });
    
    try {
      // Always fetch from API when Update is clicked
      // By default, use incremental update (only fetch new transactions)
      const url = fullRefresh 
        ? '/api/fees?forceApi=true&fullRefresh=true'
        : '/api/fees?forceApi=true&incremental=true';
      
      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Update successful:', {
          newTransactions: result.stats?.totalTransactions || 0,
          lastProcessed: result.lastProcessed,
        });
        
        // Show update message
        const ethereumNew = result.stats?.ethereumTransactions || 0;
        const hyperevmNew = result.stats?.hyperevmTransactions || 0;
        const message = fullRefresh
          ? `✅ Full refresh complete! Loaded ${result.stats?.totalTransactions || 0} transactions.`
          : `✅ Incremental update complete! Found ${ethereumNew + hyperevmNew} new transactions (${ethereumNew} Ethereum, ${hyperevmNew} HyperEVM).`;
        
        setUpdateMessage({ type: 'success', text: message });
        setTimeout(() => setUpdateMessage(null), 5000);
        
        // Update data
        setData(result.data);
        setRecentTransactions(result.recentTransactions || []);
        setLastUpdated(new Date());
        saveToCache(result.data, result.recentTransactions || []);
      } else {
        setUpdateMessage({ type: 'error', text: `❌ ${result.error || 'Update failed'}` });
        setTimeout(() => setUpdateMessage(null), 5000);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Update failed';
      setUpdateMessage({ type: 'error', text: `❌ Network error: ${errorMsg}` });
      setTimeout(() => setUpdateMessage(null), 5000);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClearCache = () => {
    try {
      localStorage.removeItem('gondi-fees-cache');
      console.log('✅ Cache cleared');
      setUpdateMessage({ type: 'success', text: '✅ Cache cleared! Refreshing data...' });
      setTimeout(() => {
        setUpdateMessage(null);
        fetchFees(true, true); // Fetch fresh data
      }, 1000);
    } catch (err) {
      console.error('Error clearing cache:', err);
      setUpdateMessage({ type: 'error', text: '❌ Failed to clear cache' });
      setTimeout(() => setUpdateMessage(null), 3000);
    }
  };

  const getTotalFees = () => {
    if (!data) {
      console.warn('⚠️ getTotalFees: No data available');
      return 0;
    }
    if (!data.currencyBreakdown) {
      console.warn('⚠️ getTotalFees: No currencyBreakdown in data');
      return 0;
    }
    
    // Sum all 4 currencies: USDC, WETH, HUSDC, WHYPE
    const currencies = ['USDC', 'WETH', 'HUSDC', 'WHYPE'];
    const total = currencies.reduce((sum, currency) => {
      const breakdown = data.currencyBreakdown[currency];
      const value = breakdown?.totalUSD ?? 0;
      
      // Detailed logging for Ethereum currencies
      if (currency === 'USDC' || currency === 'WETH') {
        console.log(`💰 [getTotalFees] ${currency}:`, {
          hasBreakdown: !!breakdown,
          breakdown: breakdown,
          totalUSD: breakdown?.totalUSD,
          value: value,
          type: typeof value
        });
      }
      
      return sum + value;
    }, 0);
    
    console.log(`💰 [getTotalFees] Total: $${total.toFixed(2)}`);
    console.log('💰 [getTotalFees] Full breakdown:', JSON.stringify(data.currencyBreakdown, null, 2));
    
    return total;
  };

  const getChartData = () => {
    if (!data) return [];
    
    const source = data[activeTab];
    const firstFeeDate = '2025-10-22'; // First fee transaction date
    
    const chartData = Object.entries(source)
      .filter(([date]) => {
        // For monthly view, include October (2025-10)
        if (activeTab === 'monthly') {
          return date >= '2025-10';
        }
        // For daily and weekly, filter from Oct 22
        return date >= firstFeeDate;
      })
      .map(([date, values]: [string, { totalUSD: number; currenciesUSD?: { [key: string]: number } }]) => {
        return {
          date,
          'USDC': values.currenciesUSD?.USDC || 0,
          'WETH': values.currenciesUSD?.WETH || 0,
          'HUSDC': values.currenciesUSD?.HUSDC || 0,
          'WHYPE': values.currenciesUSD?.WHYPE || 0,
          total: values.totalUSD || 0,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Calculate totals for debugging
    const chartTotals = chartData.reduce((acc, entry) => {
      acc.USDC += entry.USDC || 0;
      acc.WETH += entry.WETH || 0;
      acc.HUSDC += entry.HUSDC || 0;
      acc.WHYPE += entry.WHYPE || 0;
      return acc;
    }, { USDC: 0, WETH: 0, HUSDC: 0, WHYPE: 0 });
    
    console.log(`📊 Chart data: ${chartData.length} entries from ${chartData[0]?.date || 'N/A'} to ${chartData[chartData.length - 1]?.date || 'N/A'}`);
    console.log(`📊 Chart totals - USDC: $${chartTotals.USDC.toFixed(2)}, WETH: $${chartTotals.WETH.toFixed(2)}, HUSDC: $${chartTotals.HUSDC.toFixed(2)}, WHYPE: $${chartTotals.WHYPE.toFixed(2)}`);
    console.log(`📊 Ethereum total in chart: $${(chartTotals.USDC + chartTotals.WETH).toFixed(2)}`);
    console.log(`📊 HyperEVM total in chart: $${(chartTotals.HUSDC + chartTotals.WHYPE).toFixed(2)}`);
    
    return chartData;
  };

  // Only show full loading screen on initial load, not during updates
  if (loading && !data) {
    return (
      <div className="container">
        <div className="loading">Loading fee data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="error">
          <p>{error}</p>
          <button
            onClick={() => fetchFees()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              background: '#171717',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#262626'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#171717'}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalFees = getTotalFees();
  const chartData = getChartData();

  const formatValue = (value: number) => {
    if (value === 0) return '0';
    if (value < 0.0001) return value.toExponential(2);
    if (value < 1) return value.toFixed(6);
    if (value < 1000) return value.toFixed(4);
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  if (!data || totalFees === 0) {
    return (
      <div className="container">
        <div className="header">
          <h1>GONDI Protocol Fees Dashboard</h1>
          <p>Track fees collected across Ethereum and HyperEVM networks</p>
        </div>
        <div className="error" style={{ background: 'white', color: '#666', maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ color: '#333', marginBottom: '1rem' }}>No Fee Data Found</h2>
          <p style={{ marginBottom: '1rem' }}>This could mean:</p>
          <ul style={{ textAlign: 'left', marginTop: '1rem', paddingLeft: '2rem', marginBottom: '1.5rem' }}>
            <li><strong>API Key Required:</strong> Etherscan API V1 is deprecated. You need a free API key to fetch data.</li>
            <li>The addresses have not received any transactions yet</li>
            <li>The API endpoints are temporarily unavailable</li>
          </ul>
          <div style={{ background: '#f0f4ff', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
            <h3 style={{ color: '#667eea', marginBottom: '0.5rem' }}>Quick Setup:</h3>
            <ol style={{ textAlign: 'left', paddingLeft: '1.5rem' }}>
              <li>Get a free API key at <a href="https://etherscan.io/myapikey" target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>etherscan.io/myapikey</a></li>
              <li>Add it to <code style={{ background: '#e0e0e0', padding: '2px 6px', borderRadius: '4px' }}>.env.local</code>: <code style={{ background: '#e0e0e0', padding: '2px 6px', borderRadius: '4px' }}>ETHERSCAN_API_KEY=your_key</code></li>
              <li>Restart the server and refresh this page</li>
            </ol>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              handleUpdate(false);
            }}
            disabled={isUpdating || loading}
            style={{
              padding: '0.5rem 1rem',
              background: (isUpdating || loading) ? '#a3a3a3' : '#171717',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: (isUpdating || loading) ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              marginRight: '0.5rem',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isUpdating && !loading) {
                e.currentTarget.style.backgroundColor = '#262626';
              }
            }}
            onMouseLeave={(e) => {
              if (!isUpdating && !loading) {
                e.currentTarget.style.backgroundColor = '#171717';
              }
            }}
          >
            {isUpdating ? 'Updating...' : 'Update'}
          </button>
          <a
            href="https://etherscan.io/myapikey"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '0.5rem 1rem',
              background: '#171717',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              textDecoration: 'none',
              display: 'inline-block',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#262626'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#171717'}
          >
            Get API Key
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Update Status Notification */}
      {updateMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: updateMessage.type === 'success' ? '#10b981' : 
                     updateMessage.type === 'error' ? '#ef4444' : '#3b82f6',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          zIndex: 1000,
          maxWidth: '400px',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          animation: 'slideIn 0.3s ease-out',
        }}>
          <span>{updateMessage.text}</span>
          <button
            onClick={() => setUpdateMessage(null)}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: 'white',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
          >
            ✕
          </button>
        </div>
      )}
      
      <div className="header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <h1>GONDI Protocol Fees Dashboard</h1>
            <p>Track fees collected across Ethereum and HyperEVM networks</p>
            {data && (data as any).isDemo && (
              <div style={{ 
                background: '#fafafa', 
                border: '1px solid #e5e5e5',
                padding: '0.75rem 1rem', 
                borderRadius: '6px', 
                marginTop: '1rem',
                fontSize: '0.875rem',
                color: '#737373',
                display: 'inline-block'
              }}>
                📊 Showing demo data. Add your Etherscan API key to see real blockchain data.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={handleClearCache}
                disabled={isUpdating || loading}
                style={{
                  padding: '0.625rem 1rem',
                  background: loading ? '#a3a3a3' : '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  transition: 'background-color 0.15s',
                  whiteSpace: 'nowrap',
                  height: 'fit-content',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#dc2626';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#ef4444';
                  }
                }}
                title="Clear cached data and refresh"
              >
                Clear Cache
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleUpdate(false);
                }}
                disabled={isUpdating || loading}
                style={{
                  padding: '0.625rem 1.25rem',
                  background: loading ? '#a3a3a3' : '#171717',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  transition: 'background-color 0.15s',
                  whiteSpace: 'nowrap',
                  height: 'fit-content',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#262626';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#171717';
                  }
                }}
                title="Update: Fetch only new transactions since last update (incremental)"
              >
                {isUpdating ? 'Updating...' : 'Update'}
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleUpdate(true);
                }}
                disabled={isUpdating || loading}
                style={{
                  padding: '0.625rem 1rem',
                  background: loading ? '#a3a3a3' : '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  transition: 'background-color 0.15s',
                  whiteSpace: 'nowrap',
                  height: 'fit-content',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#d97706';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#f59e0b';
                  }
                }}
                title="Full Refresh: Fetch all transactions from October 22, 2025 (slower)"
              >
                Full Refresh
              </button>
            </div>
            {lastUpdated && (
              <div style={{ fontSize: '0.75rem', color: '#737373' }}>
                Last updated: {format(lastUpdated, 'MMM dd, yyyy HH:mm:ss')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Network Summary */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)', 
        gap: '1rem', 
        marginBottom: '2rem' 
      }}>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
          <h3 style={{ color: 'white', marginBottom: '0.5rem' }}>Ethereum Network</h3>
          <div className="value" style={{ color: 'white', fontSize: '2rem', fontWeight: 'bold' }}>
            ${formatValue((data?.currencyBreakdown.USDC?.totalUSD || 0) + (data?.currencyBreakdown.WETH?.totalUSD || 0))}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            USDC: ${formatValue(data?.currencyBreakdown.USDC?.totalUSD || 0)} • 
            WETH: ${formatValue(data?.currencyBreakdown.WETH?.totalUSD || 0)}
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
          <h3 style={{ color: 'white', marginBottom: '0.5rem' }}>HyperEVM Network</h3>
          <div className="value" style={{ color: 'white', fontSize: '2rem', fontWeight: 'bold' }}>
            ${formatValue((data?.currencyBreakdown.HUSDC?.totalUSD || 0) + (data?.currencyBreakdown.WHYPE?.totalUSD || 0))}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            HUSDC: ${formatValue(data?.currencyBreakdown.HUSDC?.totalUSD || 0)} • 
            WHYPE: ${formatValue(data?.currencyBreakdown.WHYPE?.totalUSD || 0)}
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="stat-card">
          <h3>Total Fees Collected</h3>
          <div className="value">${formatValue(totalFees)}</div>
          <div style={{ fontSize: '0.75rem', color: '#737373', marginTop: '0.5rem' }}>
            Ethereum: ${formatValue((data?.currencyBreakdown.USDC?.totalUSD || 0) + (data?.currencyBreakdown.WETH?.totalUSD || 0))} • 
            HyperEVM: ${formatValue((data?.currencyBreakdown.HUSDC?.totalUSD || 0) + (data?.currencyBreakdown.WHYPE?.totalUSD || 0))}
          </div>
        </div>
        {['USDC', 'WETH', 'HUSDC', 'WHYPE'].map((currency) => {
          const breakdown = data?.currencyBreakdown?.[currency];
          // Always show all 4 currencies, even if breakdown is missing (show $0)
          const totalUSD = breakdown?.totalUSD ?? 0;
          const percentage = breakdown?.percentage ?? 0;
          
          // Debug logging - log every render
          console.log(`[RENDER] Currency ${currency}:`, {
            hasData: !!data,
            hasCurrencyBreakdown: !!data?.currencyBreakdown,
            hasBreakdown: !!breakdown,
            breakdown: breakdown,
            totalUSD: totalUSD,
            percentage: percentage,
            rawValue: breakdown?.totalUSD
          });
          
          // Force re-render check
          if (!data) {
            console.warn(`[RENDER] No data available for ${currency}`);
          }
          if (!data?.currencyBreakdown) {
            console.warn(`[RENDER] No currencyBreakdown for ${currency}`);
          }
          if (!breakdown) {
            console.warn(`[RENDER] No breakdown object for ${currency}`);
          }
          
          return (
            <div key={currency} className="stat-card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  backgroundColor: CURRENCY_COLORS[currency] || '#666',
                  borderRadius: '2px'
                }}></span>
                {currency}
                {(currency === 'USDC' || currency === 'WETH') && (
                  <span style={{ fontSize: '0.7rem', color: '#737373', marginLeft: '0.25rem' }}>
                    (Ethereum)
                  </span>
                )}
                {(currency === 'HUSDC' || currency === 'WHYPE') && (
                  <span style={{ fontSize: '0.7rem', color: '#737373', marginLeft: '0.25rem' }}>
                    (HyperEVM)
                  </span>
                )}
              </h3>
              <div className="value" style={{ 
                color: totalUSD === 0 && breakdown ? '#ef4444' : 'inherit',
                fontWeight: totalUSD === 0 && breakdown ? 'bold' : 'normal'
              }}>
                ${formatValue(totalUSD)}
              </div>
              {percentage > 0 && (
                <div style={{ fontSize: '0.75rem', color: '#737373', marginTop: '0.25rem' }}>
                  {percentage.toFixed(1)}%
                </div>
              )}
              {totalUSD === 0 && breakdown && (
                <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '0.25rem' }}>
                  ⚠️ Breakdown exists but totalUSD is 0
                </div>
              )}
              {totalUSD === 0 && !breakdown && (
                <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginTop: '0.25rem' }}>
                  ⚠️ No breakdown data
                </div>
              )}
            </div>
          );
        })}
      </div>

      {chartData.length > 0 && (
        <div className="chart-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>Fee Trends</h2>
            <div style={{ fontSize: '0.875rem', color: '#737373' }}>
              Ethereum: ${formatValue((data?.currencyBreakdown.USDC?.totalUSD || 0) + (data?.currencyBreakdown.WETH?.totalUSD || 0))} • 
              HyperEVM: ${formatValue((data?.currencyBreakdown.HUSDC?.totalUSD || 0) + (data?.currencyBreakdown.WHYPE?.totalUSD || 0))}
            </div>
          </div>
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'daily' ? 'active' : ''}`}
              onClick={() => setActiveTab('daily')}
            >
              Daily
            </button>
            <button
              className={`tab ${activeTab === 'weekly' ? 'active' : ''}`}
              onClick={() => setActiveTab('weekly')}
            >
              Weekly
            </button>
            <button
              className={`tab ${activeTab === 'monthly' ? 'active' : ''}`}
              onClick={() => setActiveTab('monthly')}
            >
              Monthly
            </button>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                tick={{ fill: '#666', fontSize: 12 }}
                axisLine={{ stroke: '#e5e5e5' }}
              />
              <YAxis 
                tick={{ fill: '#666', fontSize: 12 }}
                axisLine={{ stroke: '#e5e5e5' }}
                tickFormatter={(value) => {
                  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
                }}
              />
              <Tooltip 
                formatter={(value: number, name: string) => {
                  if (value === 0) return null;
                  return [`$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`, name];
                }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  
                  // Calculate total from all non-zero values
                  const total = payload.reduce((sum, entry) => {
                    const val = typeof entry.value === 'number' ? entry.value : 0;
                    return sum + val;
                  }, 0);
                  
                  return (
                    <div style={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e5e5',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      padding: '12px',
                    }}>
                      <div style={{ 
                        color: '#333', 
                        fontWeight: 600, 
                        marginBottom: '8px',
                        fontSize: '14px',
                        borderBottom: '1px solid #e5e5e5',
                        paddingBottom: '6px'
                      }}>
                        {label}
                      </div>
                      {payload
                        .filter(entry => entry.value && typeof entry.value === 'number' && entry.value > 0)
                        .map((entry, index) => (
                          <div key={index} style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            marginBottom: '4px',
                            fontSize: '13px',
                            color: '#666'
                          }}>
                            <span style={{ display: 'flex', alignItems: 'center' }}>
                              <span style={{
                                display: 'inline-block',
                                width: '12px',
                                height: '12px',
                                backgroundColor: entry.color || '#666',
                                marginRight: '6px',
                                borderRadius: '2px'
                              }}></span>
                              {entry.name}:
                            </span>
                            <span style={{ fontWeight: 500, color: '#333', marginLeft: '12px' }}>
                              ${(entry.value as number).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      <div style={{ 
                        marginTop: '8px',
                        paddingTop: '8px',
                        borderTop: '1px solid #e5e5e5',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontWeight: 600,
                        fontSize: '14px',
                        color: '#333'
                      }}>
                        <span>Total:</span>
                        <span>${total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  );
                }}
                labelStyle={{ color: '#333', fontWeight: 600 }}
              />
              <Legend />
              <Bar dataKey="USDC" stackId="a" fill={CURRENCY_COLORS.USDC} radius={[0, 0, 0, 0]} />
              <Bar dataKey="WETH" stackId="a" fill={CURRENCY_COLORS.WETH} radius={[0, 0, 0, 0]} />
              <Bar dataKey="HUSDC" stackId="a" fill={CURRENCY_COLORS.HUSDC} radius={[0, 0, 0, 0]} />
              <Bar dataKey="WHYPE" stackId="a" fill={CURRENCY_COLORS.WHYPE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {recentTransactions.length > 0 && (
        <div className="chart-container">
          <h2>Last 20 Transactions</h2>
          <div style={{
            background: 'white',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr',
              gap: '1rem',
              padding: '1rem',
              background: '#fafafa',
              borderBottom: '1px solid #e5e5e5',
              fontWeight: 600,
              fontSize: '0.875rem',
              color: '#666'
            }}>
              <div>Date</div>
              <div>Currency</div>
              <div>Amount</div>
              <div>USD Amount</div>
              <div>Network</div>
              <div>Hash</div>
            </div>
            {recentTransactions.map((tx, index) => {
              const date = new Date(tx.timestamp);
              const value = parseTransactionValue(tx.value, tx.tokenDecimal || 18);
              const explorerUrl = tx.network === 'ethereum' 
                ? `https://etherscan.io/tx/${tx.hash}`
                : `https://hyperevmscan.io/tx/${tx.hash}`;
              
              // Use unique key: hash + from + value to handle multiple transfers in same tx
              const uniqueKey = `${tx.hash}-${tx.from}-${tx.value}`;
              
              return (
                <div
                  key={uniqueKey}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr',
                    gap: '1rem',
                    padding: '1rem',
                    borderBottom: index < recentTransactions.length - 1 ? '1px solid #f0f0f0' : 'none',
                    fontSize: '0.875rem',
                    color: '#333'
                  }}
                >
                  <div>{format(date, 'MMM dd, yyyy HH:mm')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      backgroundColor: CURRENCY_COLORS[tx.tokenSymbol || ''] || '#666',
                      borderRadius: '2px'
                    }}></span>
                    {tx.tokenSymbol || 'N/A'}
                  </div>
                  <div>{value.toFixed(6)}</div>
                  <div style={{ fontWeight: 500, color: '#171717' }}>
                    ${tx.usdValue !== undefined ? tx.usdValue.toFixed(2) : '0.00'}
                  </div>
                  <div style={{ textTransform: 'capitalize' }}>{tx.network}</div>
                  <div>
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#2775CA',
                        textDecoration: 'none',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                    >
                      {tx.hash.slice(0, 10)}...
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

