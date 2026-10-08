import Image from 'next/image';

export function MDvoroLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'mdvoro-logo mdvoro-logo-compact' : 'mdvoro-logo'} aria-label="MDvoro">
      <Image className="mdvoro-logo-light" src="/logo-light.png" alt="MDvoro" width={880} height={167} priority />
      <Image className="mdvoro-logo-dark" src="/logo-dark.png" alt="MDvoro" width={882} height={167} priority />
    </span>
  );
}
