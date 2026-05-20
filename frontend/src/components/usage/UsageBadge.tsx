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
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-white/60 backdrop-blur-sm hover:bg-gray-50 transition-all cursor-pointer ${
          usage.isPremiumActive ? 'border-amber-200 bg-amber-50' : borderColor
        }`}
        title={usage.isPremiumActive ? "กำลังใช้งานโมเดล Premium" : `${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} tokens used`}
      >
        {usage.isPremiumActive ? (
          <>
            {/* Premium UI */}
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              <span className="text-[13px] font-semibold text-amber-600 hidden sm:block tracking-wide">
                Premium
              </span>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
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
