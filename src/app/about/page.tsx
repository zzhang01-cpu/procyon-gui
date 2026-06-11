'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n/context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Info,
  Usb,
  CheckCircle2,
  ExternalLink,
  Github,
  Mail,
  Globe,
} from 'lucide-react';

export default function AboutPage() {
  const { t, language } = useI18n();

  return (
    <div className="space-y-6">
      {/* App Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            {t.about.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* App Header */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-500 rounded-xl flex items-center justify-center">
              <Usb className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Procyon CM Control Software</h2>
              <p className="text-slate-500">{t.about.description}</p>
            </div>
          </div>

          {/* Version Info */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="text-sm text-slate-500">{t.about.version}</p>
              <p className="font-medium">1.0.0</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">{t.about.buildDate}</p>
              <p className="font-medium">2024-01-15</p>
            </div>
          </div>

          {/* Features */}
          <div>
            <h3 className="font-semibold mb-3">{t.about.features}</h3>
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>{t.about.feature1}</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>{t.about.feature2}</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>{t.about.feature3}</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>{t.about.feature4}</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>{t.about.feature5}</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Technical Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>
            {language === 'zh' ? '技术信息' : 'Technical Information'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-slate-500">Framework</p>
              <p className="font-medium">Next.js 16 + React 19</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-500">UI Components</p>
              <p className="font-medium">shadcn/ui + Radix UI</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-500">Styling</p>
              <p className="font-medium">Tailwind CSS 4</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-500">USB Communication</p>
              <p className="font-medium">Web USB API</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-500">Language</p>
              <p className="font-medium">TypeScript 5</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-500">Browser Support</p>
              <p className="font-medium">Chrome, Edge</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Supported Devices Card */}
      <Card>
        <CardHeader>
          <CardTitle>
            {language === 'zh' ? '支持的设备' : 'Supported Devices'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Usb className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="font-medium">Procyon CM</p>
                  <p className="text-sm text-slate-500">
                    {language === 'zh' ? '随钻测量工具' : 'Measurement While Drilling Tool'}
                  </p>
                </div>
              </div>
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Usb className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="font-medium">Procyon EM201</p>
                  <p className="text-sm text-slate-500">
                    {language === 'zh' ? '电磁波随钻测量工具' : 'Electromagnetic MWD Tool'}
                  </p>
                </div>
              </div>
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Usb className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="font-medium">Polaris</p>
                  <p className="text-sm text-slate-500">
                    {language === 'zh' ? '高精度随钻测量工具' : 'High-Precision MWD Tool'}
                  </p>
                </div>
              </div>
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t.about.contact}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button variant="outline" size="sm">
              <Mail className="w-4 h-4 mr-2" />
              Email
            </Button>
            <Button variant="outline" size="sm">
              <Globe className="w-4 h-4 mr-2" />
              {t.about.website}
            </Button>
            <Button variant="outline" size="sm">
              <Github className="w-4 h-4 mr-2" />
              GitHub
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-sm text-slate-500 py-4">
        <p>© 2024 Procyon CM Control Software. All rights reserved.</p>
        <p className="mt-1">
          {language === 'zh' 
            ? '本软件为简化版，不包含机器码验证功能。' 
            : 'This is a simplified version without machine code verification.'}
        </p>
      </div>
    </div>
  );
}
