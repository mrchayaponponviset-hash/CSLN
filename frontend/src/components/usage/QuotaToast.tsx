"use client";

import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useUsage } from '@/contexts/UsageContext';

export function QuotaToast() {
  const { usage, shownWarnings } = useUsage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (usage.state === 'warning' || usage.state === 'critical') {
      const warningKey = `${usage.state}-${Math.floor(usage.percentage)}`;
      if (!shownWarnings.has(warningKey)) {
        setVisible(true);
        shownWarnings.add(warningKey);
        
        // Auto hide after 5 seconds
        const timer = setTimeout(() => {
          setVisible(false);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [usage.state, usage.percentage, shownWarnings]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
      <div className="bg-white border border-amber-200 rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] p-4 flex items-start gap-4 max-w-sm">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 mt-0.5">
          <h4 className="text-[14px] font-bold text-gray-900 mb-1">
            {usage.state === 'critical' ? 'Critical Usage Level' : 'Usage Warning'}
          </h4>
          <p className="text-[13px] text-gray-500 leading-relaxed">
            You've used {Math.round(usage.percentage)}% of your tokens. 
            Only {Math.max(0, usage.limit - usage.used).toLocaleString()} tokens remaining.
          </p>
        </div>
        <button 
          onClick={() => setVisible(false)}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
