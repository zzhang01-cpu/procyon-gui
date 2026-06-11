'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';
import { Globe, RefreshCw, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface HeaderProps {
  currentPage: string;
}

const pageTitles: Record<string, { zh: string; en: string; subtitleZh: string; subtitleEn: string }> = {
  dashboard: {
    zh: '仪表盘',
    en: 'Dashboard',
    subtitleZh: '设备状态概览',
    subtitleEn: 'Device Status Overview',
  },
  connection: {
    zh: '设备连接',
    en: 'Device Connection',
    subtitleZh: '连接和管理 Procyon CM 设备',
    subtitleEn: 'Connect and manage Procyon CM devices',
  },
  parameters: {
    zh: '参数设置',
    en: 'Parameter Settings',
    subtitleZh: '配置设备参数',
    subtitleEn: 'Configure device parameters',
  },
  download: {
    zh: '数据下载',
    en: 'Data Download',
    subtitleZh: '从设备下载记录数据',
    subtitleEn: 'Download recorded data from device',
  },
  systemTest: {
    zh: '系统测试',
    en: 'System Test',
    subtitleZh: '执行设备自检和诊断',
    subtitleEn: 'Execute device self-test and diagnostics',
  },
  settings: {
    zh: '系统设置',
    en: 'System Settings',
    subtitleZh: '配置系统参数',
    subtitleEn: 'Configure system parameters',
  },
  about: {
    zh: '关于',
    en: 'About',
    subtitleZh: '软件信息',
    subtitleEn: 'Software Information',
  },
};

export function Header({ currentPage }: HeaderProps) {
  const { language, setLanguage, t } = useI18n();
  const { error, clearError, refreshDeviceInfo, connected } = useDevice();

  const pageInfo = pageTitles[currentPage] || pageTitles.dashboard;
  const title = language === 'zh' ? pageInfo.zh : pageInfo.en;
  const subtitle = language === 'zh' ? pageInfo.subtitleZh : pageInfo.subtitleEn;

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      {/* Page Title */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="max-w-sm">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center gap-2">
              <span className="flex-1">{error}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={clearError}
              >
                <X className="h-3 w-3" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Refresh Button */}
        {connected && (
          <Button
            variant="outline"
            size="icon"
            onClick={refreshDeviceInfo}
            title={t.common.refresh}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}

        {/* Language Switcher */}
        <Select value={language} onValueChange={(val) => setLanguage(val as 'zh' | 'en')}>
          <SelectTrigger className="w-[120px]">
            <Globe className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh">{t.common.chinese}</SelectItem>
            <SelectItem value="en">{t.common.english}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
