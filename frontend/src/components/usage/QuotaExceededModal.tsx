"use client";

import React, { useEffect, useState } from 'react';
import { XCircle, Zap } from 'lucide-react';
import { useUsage } from '@/contexts/UsageContext';

export function QuotaExceededModal() {
  const { usage } = useUsage();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Show modal if exceeded and not previously dismissed in this exact state
    if (usage.state === 'exceeded') {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [usage.state]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.12)] animate-in zoom-in-95 duration-300">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          
          <h2 className="text-2xl font-black text-gray-900 mb-2">
            Quota Exceeded
          </h2>
          
          <p className="text-gray-500 text-[15px] leading-relaxed mb-6">
            You've reached your token limit of <strong className="text-gray-700">{usage.limit.toLocaleString()}</strong> for this period. 
            AI generation is temporarily disabled.
          </p>
          
          <div className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between text-[14px]">
              <span className="text-gray-500 font-medium">Reset Time</span>
              <span className="text-gray-900 font-bold flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#B1B2FF]" />
                In {usage.resetIn}
              </span>
            </div>
          </div>
          
          <button 
            onClick={() => setIsOpen(false)}
            className="w-full py-3.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 active:scale-95 transition-all"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
