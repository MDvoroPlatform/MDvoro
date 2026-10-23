'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/components/i18n/provider';

type Notification = { notification_key: string; kind: 'announcement' | 'subscription_expiring'; title: string; message: string; created_at: string; read_at: string | null; subscription_until: string | null };

export function NotificationBell() {
  const { messages: m, locale } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      if (response.ok) setItems(await response.json() as Notification[]);
    } catch { /* Keep the bell usable if the notification request is temporarily unavailable. */ }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 45_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);

  const unread = items.filter(item => !item.read_at).length;
  async function markRead(item: Notification) {
    if (item.read_at) return;
    const response = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: item.notification_key }) });
    if (response.ok) setItems(current => current.map(row => row.notification_key === item.notification_key ? { ...row, read_at: new Date().toISOString() } : row));
  }
  const expiryCopy = {
    en: { title: 'Your subscription is ending soon', message: 'Your premium access ends on' },
    he: { title: 'המינוי שלך עומד להסתיים', message: 'הגישה שלך מסתיימת בתאריך' },
    ar: { title: 'اشتراكك يقترب من الانتهاء', message: 'تنتهي صلاحية وصولك بتاريخ' },
    ru: { title: 'Срок подписки скоро истекает', message: 'Доступ действует до' },
  }[locale];

  return <div className="notification-bell-wrap">
    <button type="button" className="icon-button notification-bell" aria-label={`${m.notifications.title}${unread ? `, ${unread} ${m.notifications.unread}` : ''}`} aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) void load(); }}>
      <Icon name="bell" size={18}/>{unread > 0 && <span className="notification-count">{unread > 9 ? '9+' : unread}</span>}
    </button>
    {open && <div className="notification-panel" role="dialog" aria-label={m.notifications.title}>
      <div className="notification-panel-head"><strong>{m.notifications.title}</strong><span>{unread ? `${unread} ${m.notifications.unread}` : ''}</span></div>
      {!items.length ? <p className="notification-empty">{m.notifications.empty}</p> : items.map(item => {
        const expiring = item.kind === 'subscription_expiring';
        const title = expiring ? expiryCopy.title : item.title;
        const message = expiring && item.subscription_until
          ? `${expiryCopy.message} ${new Date(item.subscription_until).toLocaleDateString(locale)}`
          : item.message;
        return <button key={item.notification_key} type="button" className={`notification-item${item.read_at ? '' : ' is-unread'}`} onClick={() => void markRead(item)}>
          <strong>{title}</strong><span>{message}</span><small>{new Date(item.created_at).toLocaleString(locale)}</small>
        </button>;
      })}
    </div>}
  </div>;
}
