'use client';

import * as React from 'react';
import { Globe } from 'lucide-react';
import { LANGUAGES, type Language } from '@/lib/i18n';

export function LanguageToggle({
  currentLanguage,
  onChange,
}: {
  currentLanguage: Language;
  onChange: (lang: Language) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold">
      <Globe className="h-3.5 w-3.5 text-brand-600 shrink-0" />
      <span className="text-muted font-bold">Language:</span>
      <select
        value={currentLanguage}
        onChange={(e) => onChange(e.target.value as Language)}
        className="bg-transparent font-bold text-foreground focus:outline-none cursor-pointer"
        aria-label="Language selector"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label} ({lang.nativeName})
          </option>
        ))}
      </select>
    </div>
  );
}
