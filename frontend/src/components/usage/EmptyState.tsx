"use client";

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50/50">
      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-gray-100 mb-5">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-[17px] font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-[14px] text-gray-500 max-w-[260px] leading-relaxed mb-6">
        {description}
      </p>
      {action && (
        <button 
          onClick={action.onClick}
          className="px-6 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold text-[13px] rounded-xl hover:bg-gray-50 active:scale-95 transition-all shadow-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
