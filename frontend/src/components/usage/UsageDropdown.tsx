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
          {usage.isPremiumActive ? (
            <span className="px-2.5 py-0.5 text-[11px] font-bold bg-amber-500/10 text-amber-600 rounded-full">Premium</span>
          ) : (
            <span className="px-2.5 py-0.5 text-[11px] font-bold bg-[#B1B2FF]/10 text-[#B1B2FF] rounded-full">Free</span>
          )}
        </div>
        
        {/* Main Usage Section */}
        <div className="px-5 pb-4">
          {usage.isPremiumActive ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <div className="w-12 h-12 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <h4 className="text-[15px] font-bold text-gray-900">Premium Active</h4>
              <p className="text-[13px] text-gray-500 mt-1">คุณกำลังใช้งานด้วย API Key ส่วนตัว (ไม่มีการหักโควต้าจากระบบ)</p>
            </div>
          ) : (
            <>
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
            </>
          )}
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
