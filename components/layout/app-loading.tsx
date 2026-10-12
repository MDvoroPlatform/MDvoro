'use client';
import Image from 'next/image';
import { useI18n } from '@/components/i18n/provider';
import styles from './app-loading.module.css';

export function AppLoading() {
  const { messages: m } = useI18n();

  return (
    <main className={styles.overlay} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.content}>
        <Image
          className={styles.logo}
          src="/logo-light.png"
          alt="MDvoro"
          width={880}
          height={167}
          priority
        />
        <span className={styles.spinner} aria-hidden="true">
          <span className={styles.track} />
          <span className={styles.arc} />
          <span className={styles.dot} />
        </span>
        <p className={styles.message}>{m.common.loadingWorkspace}</p>
      </div>
    </main>
  );
}

