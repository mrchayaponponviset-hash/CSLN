"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUsage } from '@/contexts/UsageContext';
import { StatCard } from '@/components/usage/StatCard';
import { EmptyState } from '@/components/usage/EmptyState';
import { Zap, Activity, Clock, BarChart3, Lock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { apiService } from '@/services/api';

// Example Mock Data (since backend endpoints for history aren't fully ready yet)
const MOCK_HISTORY = [
  { date: 'Mon', tokens: 12000 },
  { date: 'Tue', tokens: 18000 },
  { date: 'Wed', tokens: 15000 },
  { date: 'Thu', tokens: 25000 },
  { date: 'Fri', tokens: 32000 },
  { date: 'Sat', tokens: 41000 },
  { date: 'Sun', tokens: 34200 },
];

const MOCK_BREAKDOWN = [
  { name: 'Chat', value: 15000, color: '#B1B2FF' },
  { name: 'Quiz', value: 8000, color: '#9293FF' },
  { name: 'Flashcards', value: 5000, color: '#FCD34D' },
  { name: 'Exam', value: 6200, color: '#F87171' },
];

const MOCK_LOGS = [
  { id: 1, type: 'quiz', tokens: 1800, date: 'Today, 10:30 AM', status: 'success' },
  { id: 2, type: 'chat', tokens: 450, date: 'Today, 09:15 AM', status: 'success' },
  { id: 3, type: 'exam', tokens: 2500, date: 'Yesterday, 14:20 PM', status: 'success' },
  { id: 4, type: 'flashcard', tokens: 1200, date: 'Yesterday, 11:00 AM', status: 'success' },
  { id: 5, type: 'quiz', tokens: 1800, date: 'Mon, 08:45 AM', status: 'failed' },
];

export default function UsageDashboard() {
  const { user } = useAuth();
  const { usage, loading } = useUsage();
  
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <EmptyState 
          icon={Lock} 
          title="Authentication Required" 
          description="Please sign in to view your AI usage statistics." 
        />
      </div>
    );
  }

  if (loading) {
    return <div className="p-12 text-center text-gray-500">Loading dashboard...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900 font-mono tracking-tight">AI Usage Analytics</h1>
        <p className="text-[14px] text-gray-500 mt-1">Track and manage your token consumption</p>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard 
          label="Total Tokens Used" 
          value={usage.used.toLocaleString()} 
          subtext={`/ ${usage.limit.toLocaleString()} limit`}
          icon={Zap}
          color={usage.state === 'normal' ? 'primary' : usage.state === 'warning' ? 'warning' : 'critical'}
        />
        <StatCard 
          label="Estimated Generation" 
          value="~17" 
          subtext="requests remaining"
          icon={Activity}
          color="success"
        />
        <StatCard 
          label="Daily Average" 
          value="4,850" 
          subtext="tokens per day"
          icon={BarChart3}
          trend={{ value: 12, isPositive: false }}
        />
        <StatCard 
          label="Next Reset" 
          value={usage.resetIn} 
          subtext="Automatic refresh"
          icon={Clock}
          color="primary"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Main Area Chart */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-[15px] font-bold text-gray-900 mb-6">Usage Over Time (7 Days)</h3>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_HISTORY} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#B1B2FF" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#B1B2FF" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} dx={-10} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  itemStyle={{ color: '#1F2937', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="tokens" stroke="#B1B2FF" strokeWidth={3} fillOpacity={1} fill="url(#colorTokens)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col">
          <h3 className="text-[15px] font-bold text-gray-900 mb-2">Usage by Feature</h3>
          <div className="flex-1 flex items-center justify-center min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={MOCK_BREAKDOWN}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={80}
                  paddingAngle={5} dataKey="value"
                  stroke="none"
                >
                  {MOCK_BREAKDOWN.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {MOCK_BREAKDOWN.map(item => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[12px] text-gray-600 font-medium">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity Logs Table */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-gray-900">Recent Activity</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Request Type</th>
                <th className="px-6 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Tokens</th>
                <th className="px-6 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Date & Time</th>
                <th className="px-6 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MOCK_LOGS.map(log => (
                <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium capitalize bg-gray-100 text-gray-700">
                      {log.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[13px] font-mono font-bold text-gray-900">
                    +{log.tokens.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-[13px] text-gray-500">
                    {log.date}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {log.status === 'success' ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-green-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Success
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-red-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
