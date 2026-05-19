"use client";

import React from 'react';
import { Sparkles } from 'lucide-react';
import { useUsage } from '@/contexts/UsageContext';

export const ESTIMATED_TOKENS = {
  quiz_5: 1800,
  quiz_10: 3600,
  flashcard: 450,
  exam_batch: 2500,
  chat_message: 400,
} as const;

interface TokenEstimatorProps {
  type: keyof typeof ESTIMATED_TOKENS;
}

export function TokenEstimator({ type }: TokenEstimatorProps) {
  const { usage, loading } = useUsage();
  
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl mb-3">
        <div className="w-4 h-4 rounded-full bg-gray-200 animate-pulse" />
        <div className="h-3 bg-gray-200 rounded w-48 animate-pulse" />
      </div>
    );
  }

  const estimatedCost = ESTIMATED_TOKENS[type];
  const remaining = usage.limit - usage.used;
  const runsLeft = Math.floor(remaining / estimatedCost);

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl text-[13px] text-gray-500 mb-3">
      <Sparkles className="w-4 h-4 text-[#B1B2FF]" />
      <span>
        Est. ~{estimatedCost.toLocaleString()} tokens · {remaining.toLocaleString()} remaining 
        {runsLeft > 0 ? ` (${runsLeft} more runs)` : ''}
      </span>
    </div>
  );
}
