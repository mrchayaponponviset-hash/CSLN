"use client";

import React, { useEffect, useRef } from 'react';
import { useUsage } from '@/contexts/UsageContext';
import Link from 'next/link';

interface UsageDropdownProps {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function UsageDropdown({ onClose, anchorRef }: UsageDropdownProps) {
  const { usage } = useUsage();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, anchorRef]);

  let barColor = 'bg-[#B1B2FF]';
  if (usage.state === 'warning') barColor = 'bg-amber-500';
  else if (usage.state === 'critical' || usage.state === 'exceeded') barColor = 'bg-red-500';

  const averageCost = 2000;
  const remaining = Math.max(0, usage.limit - usage.used);
  const remainingGenerations = Math.floor(remaining / averageCost);

  return (
    <>
      {/* Mobile Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden" onClick={onClose} />
      
      {/* Panel (Desktop: Popover, Mobile: Bottom Sheet) */}
      <div 
        ref={dropdownRef}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[80vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom-10 md:animate-dropdown-in
                   md:absolute md:top-full md:bottom-auto md:right-0 md:left-auto md:mt-2 md:w-[360px] md:rounded-2xl md:border md:border-gray-200 md:shadow-[0_8px_40px_rgba(0,0,0,0.08)]"
      >
        {/* Mobile Drag Handle */}
        <div className="flex justify-center py-3 md:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 md:pt-5 pb-3">
          <h3 className="text-[15px] font-bold text-gray-900">AI Usage</h3>
          <span className="px-2.5 py-0.5 text-[11px] font-bold bg-[#B1B2FF]/10 text-[#B1B2FF] rounded-full">Free</span>
        </div>
        
        {/* Main Usage Section */}
        <div className="px-5 pb-4">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-2xl font-bold text-gray-900">{usage.used.toLocaleString()}</span>
            <span className="text-[13px] text-gray-400">/ {usage.limit.toLocaleString()} tokens</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{width: `${usage.percentage}%`}} />
          </div>
          <div className="flex justify-between mt-2 text-[12px] text-gray-500">
            <span>⏱ Reset in {usage.resetIn}</span>
            <span>~{remainingGenerations} generations left</span>
          </div>
        </div>
        
        {/* Footer CTA */}
        {/* 
        <div className="px-5 py-3 border-t border-gray-100">... history here ...</div>
        <Link href="/usage" onClick={onClose} className="block px-5 py-3 border-t border-gray-100 text-[13px] font-semibold text-[#B1B2FF] hover:bg-gray-50 rounded-b-2xl text-center transition-colors">
          View Full Dashboard →
        </Link>
        */}
      </div>
    </>
  );
}
