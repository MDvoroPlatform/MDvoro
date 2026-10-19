'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';

type Media = {
    id: string;
    kind: string;
    title: string;
    external_url: string | null;
    url?: string | null;
    copyright_status: string;
    usage_count?: number;
};

const uploadErrorMessages: Record<string, string> = {
    file_too_large: 'This image is over the 10 MB limit.',
    unsupported_file_type: 'Choose a JPG, PNG, WebP, GIF, or HEIC/HEIF image.',
    file_signature_mismatch: 'The file contents do not match a supported image. Choose a valid image.',
    preview_unavailable: 'The image could not be secured for preview. Check the media storage permissions and try again.',
    upload_failed: 'The image could not be uploaded. Check your connection and try again.',
    asset_record_failed: 'The image could not be added to the library. Please try again.',
};
const isVisualMedia = (asset: Media) => ['image', 'ecg', 'xray', 'ct', 'mri', 'pathology', 'diagram'].includes(asset.kind);

export function MediaPicker({ media, selectedIds, canEdit, onChange }: {
    media: Media[];
    selectedIds: string[];
    canEdit: boolean;
    onChange: (ids: string[]) => void;
}) {
    const fileInput = useRef<HTMLInputElement>(null);
    const [results, setResults] = useState(media.filter(isVisualMedia));
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [message, setMessage] = useState('');

    async function search() {
        setBusy(true);
        setMessage('');
        try {
            const response = await fetch(`/api/admin/media/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                setMessage('تعذر البحث في مكتبة الصور. حاول مرة أخرى.');
                return;
            }
            const incoming = (Array.isArray(body.media) ? body.media as Media[] : []).filter(isVisualMedia);
            const selected = results.filter((asset) => selectedIds.includes(asset.id));
            setResults([...selected, ...incoming.filter((asset) => !selected.some((item) => item.id === asset.id))]);
        } catch {
            setMessage('تعذر الاتصال بمكتبة الصور. تحقق من الاتصال وحاول مرة أخرى.');
        } finally {
            setBusy(false);
        }
    }

    async function upload(file?: File) {
        if (!file || !canEdit) return;
        setMessage('');
        if (selectedIds.length >= 20) {
            setMessage('This question can have up to 20 images. Remove one to add another.');
            return;
        }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'].includes(file.type)) {
            setMessage('Choose a JPG, PNG, WebP, GIF, or iPhone HEIC/HEIF image.');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setMessage('This image is over the 10 MB limit.');
            return;
        }

        setBusy(true);
        try {
            const title = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 180) || 'Question image';
            const form = new FormData();
            form.set('kind', 'image');
            form.set('title', title);
            form.set('altText', title.slice(0, 500));
            form.set('copyrightStatus', 'review_required');
            form.set('file', file);
            const response = await fetch('/api/admin/media/upload', { method: 'POST', body: form });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || typeof body.id !== 'string') {
                setMessage(uploadErrorMessages[body.error] ?? 'تعذر رفع الصورة. حاول مرة أخرى.');
                return;
            }
            const asset: Media = {
                id: body.id,
                kind: 'image',
                title,
                external_url: null,
                url: typeof body.url === 'string' ? body.url : null,
                copyright_status: 'review_required',
                usage_count: 0,
            };
            setResults((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
            onChange(selectedIds.includes(asset.id) ? selectedIds : [...selectedIds, asset.id]);
            setMessage('Image uploaded and attached. It will be saved with the question.');
        } catch {
            setMessage('The upload could not connect. Check your connection and try again.');
        } finally {
            setBusy(false);
            if (fileInput.current) fileInput.current.value = '';
        }
    }

    function toggle(id: string, checked: boolean) {
        if (checked && selectedIds.length >= 20) {
            setMessage('This question can have up to 20 images. Remove one to add another.');
            return;
        }
        onChange(checked
            ? (selectedIds.includes(id) ? selectedIds : [...selectedIds, id])
            : selectedIds.filter((value) => value !== id));
    }

    const selected = results.filter((asset) => selectedIds.includes(asset.id));

    return <div className="question-media-picker">
      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
        disabled={!canEdit || busy}
        aria-label="Choose a question image"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      <button
        className={`question-image-dropzone${dragging ? ' is-dragging' : ''}`}
        type="button"
        disabled={!canEdit || busy}
        onClick={() => fileInput.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files[0]); }}
      >
        <span className="question-image-dropzone-icon" aria-hidden="true">＋</span>
        <strong>{busy ? 'Uploading image…' : 'Drop an image here or click to choose'}</strong>
        <span>JPG, PNG, WebP, GIF, or iPhone HEIC/HEIF · up to 10 MB</span>
        <span className="question-image-browse">Choose an image from your device</span>
      </button>

      <div className="media-search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Or search saved images: X-ray, ECG…"
          aria-label="Search image library"
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }}
        />
        <button className="btn" type="button" disabled={busy} onClick={() => void search()}>{busy ? 'Working…' : 'Search'}</button>
      </div>

      {selected.length > 0 && <div className="question-image-selected" aria-live="polite">
        <div className="question-image-selected-title">Attached images ({selectedIds.length})</div>
        <div className="question-image-thumbnails">
          {selected.map((asset) => <div className="question-image-thumb" key={asset.id}>
            {(asset.url || asset.external_url) ? <Image src={asset.url || asset.external_url || ''} alt={asset.title} width={120} height={90} unoptimized /> : <span className="question-image-thumb-placeholder" aria-hidden="true">▧</span>}
            <span title={asset.title}>{asset.title}</span>
            <button type="button" disabled={!canEdit} onClick={() => toggle(asset.id, false)} aria-label={`Remove ${asset.title}`}>Remove</button>
          </div>)}
        </div>
      </div>}

      <div className="media-picker" aria-label="Image library results">
        {results.filter((asset) => isVisualMedia(asset) && !selectedIds.includes(asset.id)).slice(0, 12).map((asset) => <label className="media-pick" key={asset.id}>
          <input disabled={!canEdit} type="checkbox" checked={false} onChange={(event) => toggle(asset.id, event.target.checked)} />
          {(asset.url || asset.external_url) ? <Image src={asset.url || asset.external_url || ''} alt="" width={120} height={90} unoptimized loading="lazy" /> : <span className="media-pick-placeholder" aria-hidden="true">▧</span>}
          <span><b>{asset.title}</b><small>{asset.kind} · used {asset.usage_count ?? 0}× · {asset.copyright_status}</small></span>
        </label>)}
        {!results.length && <p className="media-picker-empty">No images in the library yet. Choose an image from your device to add one.</p>}
      </div>
      {message && <p className="question-media-message" role="status">{message}</p>}
    </div>;
}
