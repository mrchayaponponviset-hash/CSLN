"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { apiService } from '@/services/api';

interface UsageData {
  used: number;
  limit: number;
  percentage: number;
  state: 'normal' | 'warning' | 'critical' | 'exceeded';
  resetAt: string | null;       // ISO timestamp
  resetIn: string;              // Human readable: "5h 22m"
  todayUsed: number;
  weekUsed: number;
  recentActivity: ActivityItem[];
}

interface ActivityItem {
  type: 'chat' | 'quiz' | 'flashcard' | 'exam';
  tokens: number;
  timestamp: string;
  status: 'success' | 'failed';
}

interface UsageContextType {
  usage: UsageData;
  loading: boolean;
  refreshUsage: () => Promise<void>;
  updateFromStream: (data: { used: number; limit: number }) => void;
  canGenerate: (estimatedTokens: number) => boolean;
  shownWarnings: Set<string>;    // Track which warnings shown this session
}

const defaultUsage: UsageData = {
  used: 0,
  limit: 50000,
  percentage: 0,
  state: 'normal',
  resetAt: null,
  resetIn: '24h 00m',
  todayUsed: 0,
  weekUsed: 0,
  recentActivity: []
};

const UsageContext = createContext<UsageContextType>({} as UsageContextType);

export function useUsage() {
  return useContext(UsageContext);
}

export function UsageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageData>(defaultUsage);
  const [loading, setLoading] = useState(true);
  const [shownWarnings] = useState(new Set<string>());

  // Calculate derived state
  const calculateState = useCallback((used: number, limit: number) => {
    const pct = (used / limit) * 100;
    let state: UsageData['state'] = 'normal';
    if (pct >= 100) state = 'exceeded';
    else if (pct >= 90) state = 'critical';
    else if (pct >= 70) state = 'warning';
    return { percentage: Math.min(pct, 100), state };
  }, []);

  // Fetch quota from API
  const refreshUsage = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const data = await apiService.getUserQuota(user.uid);
      const { percentage, state } = calculateState(data.used, data.limit);
      setUsage(prev => ({
        ...prev,
        used: data.used,
        limit: data.limit,
        percentage,
        state,
      }));
    } catch (e) {
      console.error('Failed to fetch usage:', e);
    } finally {
      setLoading(false);
    }
  }, [user, calculateState]);

  // Live update from streaming responses
  const updateFromStream = useCallback((data: { used: number; limit: number }) => {
    const { percentage, state } = calculateState(data.used, data.limit);
    setUsage(prev => ({
      ...prev,
      used: data.used,
      limit: data.limit,
      percentage,
      state,
    }));
  }, [calculateState]);

  // Check if generation is possible
  const canGenerate = useCallback((estimatedTokens: number) => {
    return (usage.used + estimatedTokens) <= usage.limit;
  }, [usage]);

  // Initial fetch + polling
  useEffect(() => {
    refreshUsage();
    const interval = setInterval(refreshUsage, 60000); // Poll every 60s
    return () => clearInterval(interval);
  }, [refreshUsage]);

  // Visibility-based polling optimization
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshUsage(); // Refresh immediately when tab becomes visible
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refreshUsage]);

  return (
    <UsageContext.Provider value={{
      usage, loading, refreshUsage, updateFromStream, canGenerate, shownWarnings
    }}>
      {children}
    </UsageContext.Provider>
  );
}
