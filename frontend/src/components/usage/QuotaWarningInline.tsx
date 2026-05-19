"use client";

import React from 'react';
import { AlertTriangle, AlertCircle, XCircle } from 'lucide-react';
import { useUsage } from '@/contexts/UsageContext';

export function QuotaWarningInline() {
  const { usage, loading } = useUsage();
  
  if (loading || usage.state === 'normal') {
    return null;
  }
  
  const remaining = usage.limit - usage.used;
  // Estimate based on an average generation (e.g. 2000 tokens)
  const averageGenerationsLeft = Math.max(0, Math.floor(remaining / 2000));
  
  const config = {
    warning: {
      bg: 'bg-amber-50', 
      border: 'border-amber-200', 
      text: 'text-amber-700',
      icon: <AlertTriangle className="w-4 h-4" />, 
      message: `Running low — ~${averageGenerationsLeft} generations left`
    },
    critical: {
      bg: 'bg-red-50', 
      border: 'border-red-200', 
      text: 'text-red-600',
      icon: <AlertCircle className="w-4 h-4" />, 
      message: 'Almost depleted — this may be your last generation'
    },
    exceeded: {
      bg: 'bg-red-50', 
      border: 'border-red-200', 
      text: 'text-red-700',
      icon: <XCircle className="w-4 h-4" />, 
      message: `Quota exceeded. Resets in ${usage.resetIn}`
    }
  };
  
  const c = config[usage.state];
  
  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 ${c.bg} ${c.border} border rounded-xl text-[13px] ${c.text} mb-3`}>
      {c.icon}
      <span>{c.message}</span>
    </div>
  );
}
