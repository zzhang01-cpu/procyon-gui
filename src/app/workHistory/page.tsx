'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n/context';

interface WorkHistoryPageProps {
  onNavigate: (page: string) => void;
}

export default function WorkHistoryPage({ onNavigate }: WorkHistoryPageProps) {
  const { t } = useI18n();

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">{t.workHistory.title}</h2>
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="text-center py-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-slate-300 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">{t.workHistory.noHistory}</h3>
          <p className="text-xs text-slate-500">{t.workHistory.noHistoryDescription}</p>
        </div>
      </div>
    </div>
  );
}
