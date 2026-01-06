'use client';

import { useEffect, useState } from 'react';
import { AggregatedFees } from '@/lib/types';
import { format, startOfWeek, startOfMonth } from 'date-fns';
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';

// Elegant fintech design system
const DESIGN_SYSTEM = {
  colors: {
    // Professional neutral grays
    gray: {
      50: '#fafbfc',
      100: '#f4f6f8',
      200: '#e4e7ea',
      300: '#d1d6db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
      950: '#0d1117',
    },
    // Sophisticated primary (deep navy)
    primary: {
      50: '#f8fafc',
      100: '#f1f5f9',
      500: '#1e40af',
      600: '#1d4ed8',
      700: '#1e3a8a',
    },
    // Professional accent
    accent: {
      500: '#059669',
      600: '#047857',
    },
    // Success states
    success: {
      50: '#f0fdf4',
      500: '#059669',
    },
  }
};

const CURRENCY_COLORS = {
  'ETH': '#1e40af',     // Deep professional blue
  'WETH': '#059669',    // Sophisticated emerald green  
  'USDC': '#6366f1',    // Refined indigo
};

interface RecentTransaction {
  hash: string;
  timestamp: number;
  tokenSymbol?: string;
  value: string;
  tokenDecimal?: number;
  from: string;
  to: string;
  network: string;
  usdValue?: number;
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon: React.ReactNode;
  color: string;
}

// Helper functions
function getTotalFees(data: AggregatedFees | null): number {
  if (!data?.currencyBreakdown) return 0;
  return Object.values(data.currencyBreakdown).reduce((sum, breakdown) => sum + (breakdown?.totalUSD || 0), 0);
}

function getChartData(data: AggregatedFees | null, activeTab: 'daily' | 'weekly' | 'monthly') {
  if (!data) return [];
  
  const source = data[activeTab];
  
  // Filter to only show data from October 2025 onwards and ensure proper date parsing
  const startDate = new Date('2025-10-01T00:00:00Z');
  const endDate = new Date('2026-02-01T00:00:00Z'); // End of January 2026
  
  return Object.entries(source)
    .filter(([date]) => {
      // Handle both date formats: 'yyyy-MM-dd' and 'yyyy-MM'
      let entryDate: Date;
      if (activeTab === 'monthly') {
        // For monthly, the date format is 'yyyy-MM', so add '-01' to make it a valid date
        entryDate = new Date(date + '-01T00:00:00Z');
      } else {
        // For daily/weekly, the date format is 'yyyy-MM-dd'
        entryDate = new Date(date + 'T00:00:00Z');
      }
      return entryDate >= startDate && entryDate < endDate;
    })
    .map(([date, values]: [string, any]) => {
      // Create proper date object for display
      let displayDate: string;
      if (activeTab === 'monthly') {
        // Monthly format: '2025-10' -> 'Oct 2025'
        const monthDate = new Date(date + '-01T00:00:00Z');
        displayDate = format(monthDate, 'MMM yyyy');
      } else {
        // Daily/Weekly format: '2025-10-22' -> 'Oct 22'  
        const dayDate = new Date(date + 'T00:00:00Z');
        displayDate = format(dayDate, 'MMM dd');
      }
      
      return {
        date: date,
        displayDate: displayDate,
        ETH: values.currenciesUSD?.ETH || 0,
        WETH: values.currenciesUSD?.WETH || 0, 
        USDC: values.currenciesUSD?.USDC || 0,
        totalUSD: values.totalUSD || 0,
      };
    })
    .sort((a, b) => {
      // Sort by actual date values
      const dateA = activeTab === 'monthly' ? new Date(a.date + '-01T00:00:00Z') : new Date(a.date + 'T00:00:00Z');
      const dateB = activeTab === 'monthly' ? new Date(b.date + '-01T00:00:00Z') : new Date(b.date + 'T00:00:00Z');
      return dateA.getTime() - dateB.getTime();
    });
}

function getCurrencyPieData(data: AggregatedFees | null) {
  if (!data?.currencyBreakdown) return [];
  
  return Object.entries(data.currencyBreakdown).map(([currency, breakdown]) => ({
    name: currency,
    value: breakdown.totalUSD,
    percentage: breakdown.percentage,
    count: breakdown.total,
  }));
}

function formatValue(value: number): string {
  if (value === 0) return '0';
  if (value < 1) return value.toFixed(6);
  if (value < 1000) return value.toFixed(2);
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function MetricCard({ title, value, subtitle, trend, icon, color }: MetricCardProps) {
  return (
    <div className="group bg-white border border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <div 
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{ backgroundColor: color + '15' }}
        >
          <div style={{ color }} className="w-4 h-4">
            {icon}
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-semibold text-gray-900 tracking-tight">{value}</p>
        <div className="flex items-center justify-between">
          {subtitle && (
            <p className="text-sm text-gray-500">{subtitle}</p>
          )}
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trend.isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d={trend.isPositive 
                  ? "M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z"
                  : "M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z"
                } />
              </svg>
              {Math.abs(trend.value).toFixed(1)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<AggregatedFees | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  useEffect(() => {
    fetchFees();
  }, []);

  const fetchFees = async (isUpdate: boolean = false) => {
    try {
      if (isUpdate) {
        setIsUpdating(true);
      } else {
        setLoading(true);
      }
      setError(null);
      
      const response = await fetch('/api/fees');
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
        setRecentTransactions(result.recentTransactions || []);
        setError(null);
      } else {
        setError(result.error || 'Failed to fetch data');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch fee data';
      setError(errorMsg);
    } finally {
      setLoading(false);
      setIsUpdating(false);
    }
  };

  const handleUpdate = () => fetchFees(true);

  // Loading state
  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-gray-200"></div>
            <div className="w-12 h-12 rounded-full border-2 border-black border-t-transparent absolute top-0 animate-spin"></div>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mt-4">Loading Analytics</h2>
          <p className="text-gray-500 mt-1">Fetching transaction data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Connection Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => fetchFees()}
            className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2.5 px-4 rounded-lg transition-colors duration-200"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const totalFees = getTotalFees(data);
  const chartData = getChartData(data, activeTab);
  const pieData = getCurrencyPieData(data);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">G</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">GONDI Analytics</h1>
                <p className="text-sm text-gray-600">Protocol revenue insights</p>
              </div>
            </div>
            
            <button
              onClick={handleUpdate}
              disabled={isUpdating}
              className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors duration-200"
            >
              {isUpdating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Updating</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Refresh</span>
                </>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <div className="max-w-7xl mx-auto p-6 space-y-8">
            {/* Header with metrics */}
            <div>
              <div className="mb-6">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  <span className="font-mono">0x4169447a424ec645f8a24dccfd8328f714dd5562</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.414-1.414L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  Last updated: {new Date().toLocaleString()}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  title="Total Revenue"
                  value={formatCurrency(totalFees)}
                  subtitle="All time"
                  color={DESIGN_SYSTEM.colors.primary[500]}
                  icon={
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  }
                />

                {Object.entries(data?.currencyBreakdown || {}).map(([currency, breakdown]) => {
                  const color = CURRENCY_COLORS[currency as keyof typeof CURRENCY_COLORS] || DESIGN_SYSTEM.colors.gray[400];
                  return (
                    <MetricCard
                      key={currency}
                      title={`${currency} Revenue`}
                      value={formatCurrency(breakdown.totalUSD)}
                      subtitle={`${formatValue(breakdown.total)} tokens`}
                      color={color}
                      icon={
                        <div className="w-4 h-4 rounded-sm flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: color }}>
                          {currency.slice(0, 2)}
                        </div>
                      }
                    />
                  );
                })}
              </div>
            </div>

            {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Revenue Chart */}
              <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Revenue Timeline</h2>
                    <p className="text-sm text-gray-500 mt-1">Fee collection trends</p>
                  </div>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    {['daily', 'weekly', 'monthly'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                          activeTab === tab
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
            
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis 
                      dataKey="displayDate" 
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} 
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const total = payload.reduce((sum, entry) => sum + (entry.value as number || 0), 0);
                        return (
                          <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-4 min-w-[220px]">
                            <p className="font-semibold text-gray-900 mb-3">{label}</p>
                            {payload.map((entry, index) => (
                              <div key={index} className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: entry.color }}
                                  ></div>
                                  <span className="text-sm text-gray-600">{entry.name}</span>
                                </div>
                                <span className="font-semibold text-gray-900">{formatCurrency(entry.value as number)}</span>
                              </div>
                            ))}
                            <div className="border-t border-gray-200 mt-3 pt-3">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-semibold text-gray-900">Total</span>
                                <span className="font-bold text-gray-900">{formatCurrency(total)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="ETH" stackId="fees" fill={CURRENCY_COLORS.ETH} name="ETH" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="WETH" stackId="fees" fill={CURRENCY_COLORS.WETH} name="WETH" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="USDC" stackId="fees" fill={CURRENCY_COLORS.USDC} name="USDC" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Distribution */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">Revenue Mix</h2>
                  <p className="text-sm text-gray-500 mt-1">By currency</p>
                </div>
            
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={CURRENCY_COLORS[entry.name as keyof typeof CURRENCY_COLORS] || DESIGN_SYSTEM.colors.gray[400]} 
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="space-y-3 mt-4">
                  {pieData.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: CURRENCY_COLORS[entry.name as keyof typeof CURRENCY_COLORS] || DESIGN_SYSTEM.colors.gray[400] }}
                        ></div>
                        <span className="text-sm font-medium text-gray-700">{entry.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(entry.value)}</p>
                        <p className="text-xs text-gray-500">{entry.percentage.toFixed(1)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

        {/* Transactions Table */}
        {recentTransactions.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
              <p className="text-sm text-gray-500 mt-1">Latest transactions</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Asset</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Amount</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Value</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Tx Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentTransactions.slice(0, 8).map((tx, index) => {
                    const date = new Date(tx.timestamp);
                    const value = parseTransactionValue(tx.value, tx.tokenDecimal || 18);
                    const color = CURRENCY_COLORS[tx.tokenSymbol as keyof typeof CURRENCY_COLORS] || DESIGN_SYSTEM.colors.gray[400];
                    
                    return (
                      <tr key={`${tx.hash}-${index}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {format(date, 'MMM dd')}
                          </div>
                          <div className="text-xs text-gray-500">
                            {format(date, 'HH:mm')}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: color }}
                            ></div>
                            <span className="text-sm font-medium text-gray-900">{tx.tokenSymbol}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm font-mono text-gray-900">
                            {formatValue(value)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm font-semibold text-gray-900">
                            {formatCurrency(tx.usdValue || 0)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <a
                            href={`https://etherscan.io/tx/${tx.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 font-mono text-sm transition-colors"
                          >
                            {tx.hash.slice(0, 8)}...{tx.hash.slice(-6)}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}