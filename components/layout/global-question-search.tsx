'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/components/i18n/provider';

type SearchResult = { id: string; content_code: string | null; stem: string; subject: string; topic: string | null; exam_code: string; exam_name: string };

export function GlobalQuestionSearch() {
  const { messages: m } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const term = query.trim();

  useEffect(() => {
    if (term.length < 4) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/qbank/search?q=${encodeURIComponent(term)}`, { signal: controller.signal, cache: 'no-store' })
        .then(async response => {
          const data = await response.json();
          if (!response.ok) throw new Error('search_failed');
          return data as SearchResult[];
        })
        .then(setResults)
        .catch(error => { if (error?.name !== 'AbortError') setResults([]); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 280);
    const closeOnOutside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => { window.clearTimeout(timer); controller.abort(); document.removeEventListener('pointerdown', closeOnOutside); };
  }, [term]);

  const resultsHref = `/qbank/search?q=${encodeURIComponent(term)}`;
  return <div className="topbar-search" ref={box}>
    <label className="search" aria-label={m.common.search}>
      <Icon name="search" size={15}/>
      <input aria-label={m.common.search} placeholder={m.search.placeholder} value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }}/>
      <span className="search-shortcut">⌘ K</span>
    </label>
    {open && term.length >= 4 && <div className="global-search-results" role="listbox" aria-label={m.search.results}>
      {loading ? <p className="global-search-state">{m.search.searching}</p> : results.length ? <>
        {results.slice(0, 6).map(result => <a key={result.id} href={resultsHref} className="global-search-result" onClick={() => setOpen(false)}>
          <strong>{result.content_code || result.subject}</strong>
          <span>{result.stem.slice(0, 150)}{result.stem.length > 150 ? '…' : ''}</span>
          <small>{result.exam_code} · {result.subject}{result.topic ? ` · ${result.topic}` : ''}</small>
        </a>)}
        <a className="global-search-all" href={resultsHref} onClick={() => setOpen(false)}>{m.search.viewResults}</a>
      </> : <p className="global-search-state">{m.search.noResults}</p>}
    </div>}
  </div>;
}
