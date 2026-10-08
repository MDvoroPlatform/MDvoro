import { cookies } from 'next/headers';
import { getMessages, type Locale, localeMeta, isLocale } from './messages';
export async function getLocale(): Promise<Locale> {
    const cookieStore = await cookies();
    const value = cookieStore.get('mdvoro_locale')?.value;
    return isLocale(value) ? value : 'en';
}
export async function getI18n() {
    const locale = await getLocale();
    return { locale, dir: localeMeta[locale].dir, messages: getMessages(locale) };
}

