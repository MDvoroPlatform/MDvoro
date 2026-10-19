'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MediaPicker } from '@/components/admin/media-picker';
type Exam = {
    id: string;
    code: string;
    name: string;
};
type Taxonomy = {
    id: string;
    name: string;
    node_type: string;
    slug: string;
    child_count: number;
};
type Media = {
    id: string;
    kind: string;
    title: string;
    external_url: string | null;
    copyright_status: string;
    usage_count?: number;
};
type Initial = {
    id?: string;
    contentCode?: string | null;
    examId: string;
    stem: string;
    subject: string;
    topic: string;
    options: {
        id: string;
        text: string;
    }[];
    answerKey: string;
    explanation: string;
    keyLearningPoint: string;
    difficulty: number | null;
    mediaIds: string[];
    taxonomyIds?: string[];
    workflowStatus?: string;
    keyTerms?: string[];
    isReconstruction?: boolean;
    reconstructionYear?: number | null;
    reconstructionLabel?: string | null;
};
const emptyOptions = ['A', 'B', 'C', 'D', 'E'].map((id) => ({ id, text: '' }));
export function QuestionForm({ exams, media, initial, canReview, canEdit = true, canPublishDirect = false, taxonomy = [], selectedTaxonomyIds = [], }: {
    exams: Exam[];
    media: Media[];
    taxonomy?: Taxonomy[];
    selectedTaxonomyIds?: string[];
    initial?: Initial;
    canReview?: boolean;
    canEdit?: boolean;
    canPublishDirect?: boolean;
}) {
    const router = useRouter();
    const [form, setForm] = useState<Initial>(initial ?? {
        examId: exams[0]?.id ?? '', stem: '', subject: '', topic: '', options: emptyOptions,
        answerKey: 'A', explanation: '', keyLearningPoint: '', difficulty: 3, mediaIds: [], workflowStatus: 'draft', keyTerms: [], isReconstruction: false, reconstructionYear: null, reconstructionLabel: 'שחזור',
    });
    const [busy, setBusy] = useState(false);
    const [selectedTaxonomy, setSelectedTaxonomy] = useState<string[]>(selectedTaxonomyIds);
    const [message, setMessage] = useState('');
    function update(patch: Partial<Initial>) { setForm((value) => ({ ...value, ...patch })); }
    function updateOption(id: string, text: string) { update({ options: form.options.map((option) => option.id === id ? { ...option, text } : option) }); }
    function addOption() {
        if (form.options.length >= 10) return;
        const id = String.fromCharCode(65 + form.options.length);
        update({ options: [...form.options, { id, text: '' }] });
    }
    function removeOption(id: string) {
        if (form.options.length <= 2) return;
        const remaining = form.options.filter((option) => option.id !== id);
        const correctIndex = remaining.findIndex((option) => option.id === form.answerKey);
        const options = remaining.map((option, index) => ({ ...option, id: String.fromCharCode(65 + index) }));
        update({ options, answerKey: options[Math.max(0, correctIndex)].id });
    }
    async function save(publishNow = false) {
        setBusy(true);
        setMessage('');
        const endpoint = form.id ? '/api/admin/questions/update' : '/api/admin/questions';
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, options: form.options.filter((option) => option.text.trim()), difficulty: form.difficulty ?? 3 }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            setMessage(body.error === 'invalid_request' ? 'Check the highlighted required fields.' : 'Could not save this draft.');
            setBusy(false);
            return;
        }
        const savedQuestionId = form.id || body.id;
        if (savedQuestionId) update({ id: savedQuestionId, workflowStatus: 'draft' });
        setMessage('Saved as draft.');
        let relatedUpdatesSucceeded = true;
        if (body.id || form.id) {
            const questionId = savedQuestionId;
            const taxonomyResponse = await fetch('/api/admin/questions/taxonomy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId, taxonomyIds: selectedTaxonomy }) });
            if (!taxonomyResponse.ok) {
                relatedUpdatesSucceeded = false;
                setMessage('Draft saved, but taxonomy could not be updated.');
            }
        }
        if (body.id || form.id) {
            const questionId = savedQuestionId;
            const keyTermsResponse = await fetch('/api/admin/questions/key-terms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId, terms: form.keyTerms ?? [] }) });
            if (!keyTermsResponse.ok) {
                relatedUpdatesSucceeded = false;
                setMessage('Draft saved, but key terms could not be updated.');
            }
            const reconstructionResponse = await fetch('/api/admin/questions/reconstruction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId, isReconstruction: Boolean(form.isReconstruction), reconstructionYear: form.reconstructionYear ?? null, reconstructionLabel: form.reconstructionLabel ?? 'שחזור' }) });
            if (!reconstructionResponse.ok) {
                relatedUpdatesSucceeded = false;
                setMessage('Draft saved, but reconstruction labeling could not be updated.');
            }
        }
        if (publishNow && canPublishDirect && relatedUpdatesSucceeded && savedQuestionId) {
            const publishResponse = await fetch('/api/admin/questions/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questionId: savedQuestionId }),
            });
            if (publishResponse.ok) {
                update({ workflowStatus: 'published' });
                setMessage('Published directly. No independent medical review was performed.');
            } else {
                setMessage('Saved as a draft, but direct publishing failed. Please try again.');
            }
        }
        router.refresh();
        if (!form.id && body.id)
            router.push(`/admin/questions/${body.id}`);
        setBusy(false);
    }
    async function submitForReview() {
        if (!form.id)
            return;
        setBusy(true);
        setMessage('');
        const response = await fetch('/api/admin/questions/submit-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: form.id }) });
        if (!response.ok) {
            setMessage('Save the latest draft first, then submit it for review.');
            setBusy(false);
            return;
        }
        update({ workflowStatus: 'in_review' });
        setMessage('Sent to the medical review queue.');
        router.refresh();
        setBusy(false);
    }
    async function review(decision: 'approved' | 'changes_requested' | 'rejected') {
        if (!form.id)
            return;
        setBusy(true);
        setMessage('');
        const response = await fetch('/api/admin/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: form.id, decision }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            setMessage(body.error === 'question_not_in_review' ? 'This question must be in the review queue first.' : 'Review action failed.');
            setBusy(false);
            return;
        }
        setMessage(decision === 'approved' ? 'Published successfully.' : 'Review decision recorded.');
        router.refresh();
        setBusy(false);
    }
    async function duplicate() {
        if (!form.id)
            return;
        setBusy(true);
        setMessage('');
        const response = await fetch('/api/admin/questions/duplicate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: form.id }) });
        const body = await response.json().catch(() => ({}));
        if (response.ok && body.id)
            router.push(`/admin/questions/${body.id}`);
        else
            setMessage('Could not duplicate this question.');
        setBusy(false);
    }
    const status = form.workflowStatus ?? 'draft';
    return <div className="editor-grid">
    <section className="card card-pad">
      <div className="form-section">
        <div className="section-title">Question identity</div>
        <div className="form-grid-2">
          <label className="field"><span>Exam</span><select disabled={!canEdit} value={form.examId} onChange={(e) => update({ examId: e.target.value })}>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.code} — {exam.name}</option>)}</select></label>
          <label className="field"><span>Subject</span><input disabled={!canEdit} value={form.subject} onChange={(e) => update({ subject: e.target.value })} placeholder="Internal Medicine"/></label>
          <label className="field"><span>Topic</span><input disabled={!canEdit} value={form.topic} onChange={(e) => update({ topic: e.target.value })} placeholder="Cardiology / Arrhythmias"/></label><label className="field"><span>Recall key terms</span><input disabled={!canEdit} value={(form.keyTerms??[]).join(', ')} onChange={(e) => update({ keyTerms: e.target.value.split(',').map((v) => v.trim()).filter(Boolean).slice(0,3) })} placeholder="Hyperkalemia, peaked T waves, ECG"/><small className="field-note">Up to 3 short recall cues shown after answering.</small></label>
          <label className="field"><span>Difficulty</span><select disabled={!canEdit} value={form.difficulty ?? 3} onChange={(e) => update({ difficulty: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></label>
          <label className="field"><span>Historical reconstruction</span><select disabled={!canEdit} value={form.isReconstruction ? 'yes' : 'no'} onChange={(e) => update({ isReconstruction: e.target.value === 'yes' })}><option value="no">No</option><option value="yes">Yes — שחזור</option></select></label>
          {form.isReconstruction && <><label className="field"><span>Reconstruction year</span><input disabled={!canEdit} type="number" min={1900} max={2100} value={form.reconstructionYear ?? ''} onChange={(e) => update({ reconstructionYear: e.target.value ? Number(e.target.value) : null })} placeholder="2016"/></label><label className="field"><span>Reconstruction label</span><input disabled={!canEdit} value={form.reconstructionLabel ?? 'שחזור'} onChange={(e) => update({ reconstructionLabel: e.target.value })} placeholder="שחזור"/><small className="field-note">Displayed as a historical reconstruction label, not as an official exam publication.</small></label></>}
        </div>
      </div>
      <div className="form-section"><div className="section-title">Knowledge classification</div><div className="taxonomy-chips">{taxonomy.length ? taxonomy.map((node) => <label className="taxonomy-chip" key={node.id}><input type="checkbox" checked={selectedTaxonomy.includes(node.id)} disabled={!canEdit} onChange={(e) => setSelectedTaxonomy((current) => e.target.checked ? [...current, node.id] : current.filter((id) => id !== node.id))}/><span>{node.name}</span><small>{node.node_type}</small></label>) : <span className="form-hint">Create subjects in Taxonomy first.</span>}</div></div><div className="form-section"><div className="section-title">Clinical question</div><label className="field"><span>Stem</span><textarea disabled={!canEdit} rows={9} value={form.stem} onChange={(e) => update({ stem: e.target.value })} placeholder="Write an original clinical question…"/></label></div>
      <div className="form-section"><div className="section-title">Answer options</div><div className="options-editor">{form.options.map((option) => <div className="option-row" key={option.id}><b>{option.id}</b><input disabled={!canEdit} value={option.text} onChange={(e) => updateOption(option.id, e.target.value)} placeholder={`Option ${option.id}`} aria-label={`Answer option ${option.id}`}/><label className="correct-answer"><input disabled={!canEdit} className="radio" type="radio" name="answer" checked={form.answerKey === option.id} onChange={() => update({ answerKey: option.id })} aria-label={`Mark option ${option.id} correct`}/><span>Correct</span></label>{canEdit && form.options.length > 2 && <button className="btn option-remove" type="button" onClick={() => removeOption(option.id)} aria-label={`Remove option ${option.id}`}>Remove</button>}</div>)}</div>{canEdit && form.options.length < 10 && <button className="btn option-add" type="button" onClick={addOption}>+ Add option</button>}</div>
      <div className="form-section"><div className="section-title">Medical explanation</div><label className="field"><span>Explanation</span><textarea disabled={!canEdit} rows={9} value={form.explanation} onChange={(e) => update({ explanation: e.target.value })} placeholder="Explain why the correct answer is correct and address important alternatives…"/></label><label className="field"><span>Key learning point</span><textarea disabled={!canEdit} rows={3} value={form.keyLearningPoint} onChange={(e) => update({ keyLearningPoint: e.target.value })} placeholder="One high-yield takeaway…"/></label></div>
      <div className="form-actions">
        {canEdit && <button className="btn" disabled={busy} onClick={() => save(false)}>{busy ? 'Saving…' : 'Save draft'}</button>}
        {canEdit && canPublishDirect && <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>{busy ? 'Saving…' : 'Publish question'}</button>}
        {canEdit && form.id && status === 'draft' && <button className="btn" disabled={busy} onClick={submitForReview}>Send for medical review</button>}
        {form.id && canReview && status === 'in_review' && <><button className="btn btn-primary" disabled={busy} onClick={() => review('approved')}>Approve & publish</button><button className="btn" disabled={busy} onClick={() => review('changes_requested')}>Request changes</button></>}
        {canEdit && form.id && <button className="btn" disabled={busy} onClick={duplicate}>Duplicate</button>}
        {message && <span className="form-message">{message}</span>}
      </div>
    </section>
    <aside className="editor-side">
      <section className="card card-pad"><div className="panel-head"><div><div className="panel-title">{form.contentCode || 'New question'}</div><div className="panel-sub">Workflow: <strong>{status.replace('_', ' ')}</strong></div></div></div></section>
      <section className="card card-pad question-live-preview"><div className="panel-title">Live preview</div><p className="preview-stem">{form.stem.trim() || 'Your question will appear here as you write.'}</p><ol type="A">{form.options.filter((option) => option.text.trim()).map((option) => <li key={option.id}>{option.text}{option.id === form.answerKey ? <span className="preview-correct">Correct answer</span> : null}</li>)}</ol>{form.explanation.trim() && <div className="preview-explanation"><strong>Explanation</strong><p>{form.explanation}</p></div>}</section>
      <section className="card card-pad"><div className="panel-title">Reusable media</div><p className="panel-sub media-help">Search the library instead of uploading duplicates. One image or ECG can safely serve hundreds of questions.</p><MediaPicker media={media} selectedIds={form.mediaIds} canEdit={canEdit} onChange={(mediaIds) => update({ mediaIds })}/><a className="btn" href="/admin/media">Open media library</a></section>
      <section className="card card-pad"><div className="panel-title">Publishing</div><div className="security-note">{canPublishDirect ? 'Admin publishing is immediate and does not require independent medical review. Each change is versioned and audited.' : 'Answers stay behind the server boundary. Editors can submit drafts to the review queue.'}</div></section>
    </aside>
  </div>;
}

