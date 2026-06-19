'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';
import { Plug, Download, Clock, Info, Monitor, Settings } from 'lucide-react';

interface HomePageProps {
  onNavigate: (page: string) => void;
}

const functionCards = [
  {
    id: 'deviceInit',
    icon: Plug,
    color: 'bg-blue-500',
    borderColor: 'border-t-blue-500',
    hoverBg: 'hover:bg-blue-50',
  },
  {
    id: 'downloadUpload',
    icon: Download,
    color: 'bg-green-500',
    borderColor: 'border-t-green-500',
    hoverBg: 'hover:bg-green-50',
  },
  {
    id: 'workHistory',
    icon: Clock,
    color: 'bg-yellow-500',
    borderColor: 'border-t-yellow-500',
    hoverBg: 'hover:bg-yellow-50',
  },
  {
    id: 'configStatus',
    icon: Info,
    color: 'bg-blue-500',
    borderColor: 'border-t-blue-500',
    hoverBg: 'hover:bg-blue-50',
  },
  {
    id: 'deviceMonitoring',
    icon: Monitor,
    color: 'bg-purple-500',
    borderColor: 'border-t-purple-500',
    hoverBg: 'hover:bg-purple-50',
  },
  {
    id: 'settings',
    icon: Settings,
    color: 'bg-slate-800',
    borderColor: 'border-t-slate-800',
    hoverBg: 'hover:bg-slate-50',
  },
];

export default function HomePage({ onNavigate }: HomePageProps) {
  const { t } = useI18n();
  const { connected } = useDevice();

  return (
    <div className="flex items-center justify-center h-full">
      <div className="grid grid-cols-3 gap-5 max-w-3xl w-full">
        {functionCards.map((card) => {
          const Icon = card.icon;
          const labelKey = (card.id + '') as keyof typeof t.home;
          const descKey = (card.id + 'Desc') as keyof typeof t.home;
          const label = t.home[labelKey] || card.id;
          const description = t.home[descKey] || '';
          const isDisabled = !connected && ['downloadUpload', 'workHistory', 'configStatus', 'deviceMonitoring'].includes(card.id);

          return (
            <button
              key={card.id}
              onClick={() => !isDisabled && onNavigate(card.id)}
              disabled={isDisabled}
              className={`bg-white rounded-lg border border-slate-200 ${card.borderColor} border-t-4 p-6 flex flex-col items-center gap-3 transition-all ${card.hoverBg} shadow-sm ${
                isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'
              }`}
            >
              <div className={`w-12 h-12 ${card.color} rounded-lg flex items-center justify-center`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div className="text-center">
                <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
                <p className="text-xs text-slate-500 mt-1">{description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
