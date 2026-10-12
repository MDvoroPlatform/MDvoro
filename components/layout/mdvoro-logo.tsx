import Image from 'next/image';

export function MDvoroLogo({ compact = false, forceLight = false }: { compact?: boolean; forceLight?: boolean }) {
  return (
    <span className={`mdvoro-logo${compact ? ' mdvoro-logo-compact' : ''}${forceLight ? ' mdvoro-logo-force-light' : ''}`} aria-label="MDvoro">
      <Image className="mdvoro-logo-light" src="/logo-light.png" alt="MDvoro" width={880} height={167} priority />
      <Image className="mdvoro-logo-dark" src="/logo-dark.png" alt="MDvoro" width={882} height={167} priority />
    </span>
  );
}
