"use client";

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  trend?: {
    value: number; // percentage
    isPositive: boolean;
  };
  color?: 'primary' | 'warning' | 'critical' | 'success';
}

export function StatCard({ label, value, subtext, icon: Icon, trend, color = 'primary' }: StatCardProps) {
  const bgColors = {
    primary: 'bg-[#B1B2FF]/10 text-[#B1B2FF]',
    warning: 'bg-amber-100 text-amber-500',
    critical: 'bg-red-100 text-red-500',
    success: 'bg-green-100 text-green-500',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgColors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[12px] font-bold px-2 py-1 rounded-full ${
            trend.isPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
          }`}>
            <span>{trend.isPositive ? '↑' : '↓'}</span>
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>
      
      <div>
        <h4 className="text-[12px] font-semibold text-gray-500 mb-1">{label}</h4>
        <div className="text-2xl font-black text-gray-900 font-mono tracking-tight">{value}</div>
        {subtext && <p className="text-[13px] text-gray-400 mt-1">{subtext}</p>}
      </div>
    </div>
  );
}
