'use client';
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { getMessages, type Locale, type Messages } from '@/lib/i18n/messages';
type I18nContextValue = {
    locale: Locale;
    messages: Messages;
};
const I18nContext = createContext<I18nContextValue>({ locale: 'en', messages: getMessages('en') });
export function I18nProvider({ locale, children }: {
    locale: Locale;
    children: ReactNode;
}) {
    return <I18nContext.Provider value={{ locale, messages: getMessages(locale) as Messages }}>{children}</I18nContext.Provider>;
}
export function useI18n() { return useContext(I18nContext); }

