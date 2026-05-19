"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { useUsage } from '@/contexts/UsageContext';
import { UsageDropdown } from './UsageDropdown';

export function UsageBadge() {
  const { usage, loading } = useUsage();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const badgeRef = useRef<HTMLButtonElement>(null);

  const toggleDropdown = () => setDropdownOpen(!dropdownOpen);

  if (loading) {
    return (
      <div className="w-24 h-8 bg-gray-100 rounded-xl animate-pulse" />
    );
  }

  // Determine colors based on state
  let barColor = 'bg-[#B1B2FF]';
  let borderColor = 'border-gray-200';
  let iconColor = 'text-[#B1B2FF]';
  
  if (usage.state === 'warning') {
    barColor = 'bg-amber-500';
    borderColor = 'border-amber-200';
    iconColor = 'text-amber-500';
  } else if (usage.state === 'critical') {
    barColor = 'bg-red-500';
    borderColor = 'border-red-200';
    iconColor = 'text-red-500';
  } else if (usage.state === 'exceeded') {
    barColor = 'bg-red-500 animate-pulse';
    borderColor = 'border-red-300';
    iconColor = 'text-red-500';
  }

  return (
    <div className="relative">
      <button 
        ref={badgeRef}
        onClick={toggleDropdown}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-white/60 backdrop-blur-sm hover:bg-gray-50 transition-all cursor-pointer ${borderColor}`}
        title={`${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} tokens used`}
      >
        {/* Mobile: Circular progress ring, Desktop: Hidden */}
        <div className="relative w-5 h-5 md:hidden">
          <svg className="w-5 h-5 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#E5E5E5" strokeWidth="4" />
            <circle 
              cx="18" cy="18" r="15" fill="none" 
              stroke={usage.state === 'normal' ? '#B1B2FF' : usage.state === 'warning' ? '#F59E0B' : '#EF4444'}
              strokeWidth="4" strokeDasharray={`${usage.percentage} 100`}
              strokeLinecap="round" className="transition-all duration-500" 
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Zap className={`w-2.5 h-2.5 ${iconColor}`} />
          </div>
        </div>

        {/* Desktop elements */}
        <div className="hidden md:flex items-center gap-2">
          <Zap className={`w-3.5 h-3.5 ${iconColor}`} />
          
          <span className="text-[13px] font-semibold text-gray-700">
            {Math.round(usage.percentage)}%
          </span>
          
          <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${usage.percentage}%` }} 
            />
          </div>
          
          <span className="text-[11px] text-gray-400 hidden lg:block">
            {Math.round(usage.used / 1000)}k/{Math.round(usage.limit / 1000)}k
          </span>
        </div>
      </button>

      {dropdownOpen && (
        <UsageDropdown 
          onClose={() => setDropdownOpen(false)} 
          anchorRef={badgeRef} 
        />
      )}
    </div>
  );
}
