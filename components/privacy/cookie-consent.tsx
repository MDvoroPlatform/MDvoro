'use client';
import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/i18n/provider';
const consentEvent = 'mdvoro-cookie-consent-change';
const readConsent = () => localStorage.getItem('mdvoro_cookie_consent');
const subscribeConsent = (onChange: () => void) => {
    window.addEventListener('storage', onChange);
    window.addEventListener(consentEvent, onChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(consentEvent, onChange);
    };
};

export function CookieConsent(){const {messages:m}=useI18n();const consent=useSyncExternalStore(subscribeConsent,readConsent,()=>null);const save=(value:'essential'|'all')=>{localStorage.setItem('mdvoro_cookie_consent',value);document.cookie=`mdvoro_cookie_consent=${value}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;window.dispatchEvent(new Event(consentEvent));};if(consent)return null;return <div className="privacy-banner" role="dialog" aria-label={m.privacy.cookieTitle}><p><strong>{m.privacy.cookieTitle}</strong> {m.privacy.cookieText} <Link href="/legal/cookies">{m.privacy.learnMore}</Link></p><div className="privacy-actions"><button className="btn" onClick={()=>save('essential')}>{m.privacy.essentialOnly}</button><button className="btn btn-primary" onClick={()=>save('all')}>{m.privacy.allowOptional}</button></div></div>}
