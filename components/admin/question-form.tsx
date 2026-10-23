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
type QBankTaxonomyNode = {
    id: string;
    parent_id: string | null;
    node_type: string;
    name: string;
    aliases: string[];
    qbank_seeded: boolean;
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
    sourceReference?: string;
    rightsBasis?: 'original' | 'licensed' | 'permission' | 'public_domain' | 'user_submitted' | 'unknown';
};
const emptyOptions = ['A', 'B', 'C', 'D', 'E'].map((id) => ({ id, text: '' }));
export function QuestionForm({ exams, media, initial, canReview, canEdit = true, canPublishDirect = false, taxonomy = [], qbankTaxonomy = [], selectedTaxonomyIds = [], }: {
    exams: Exam[];
    media: Media[];
    taxonomy?: Taxonomy[];
    qbankTaxonomy?: QBankTaxonomyNode[];
    selectedTaxonomyIds?: string[];
    initial?: Initial;
    canReview?: boolean;
    canEdit?: boolean;
    canPublishDirect?: boolean;
}) {
    const router = useRouter();
    const [form, setForm] = useState<Initial>(initial ?? {
        examId: exams[0]?.id ?? '', stem: '', subject: '', topic: '', options: emptyOptions,
        answerKey: 'A', explanation: '', keyLearningPoint: '', difficulty: 3, mediaIds: [], workflowStatus: 'draft', keyTerms: [], isReconstruction: false, reconstructionYear: null, reconstructionLabel: 'שחזור', sourceReference: '', rightsBasis: 'unknown',
    });
    const [busy, setBusy] = useState(false);
    const [selectedTaxonomy, setSelectedTaxonomy] = useState<string[]>(selectedTaxonomyIds);
    const [message, setMessage] = useState('');
    const qbankSubjects = qbankTaxonomy.filter((node) => node.node_type === 'subject');
    const qbankTopics = qbankTaxonomy.filter((node) => node.node_type === 'topic' && node.qbank_seeded);
    const normalize = (value: string) => value.trim().toLocaleLowerCase();
    const subjectNode = qbankSubjects.find((node) => [node.name, ...node.aliases].some((name) => normalize(name) === normalize(form.subject)));
    const subjectChoice = subjectNode?.id ?? '__custom__';
    const topicsForSubject = subjectNode ? qbankTopics.filter((node) => node.parent_id === subjectNode.id) : [];
    const selectedTopicNode = topicsForSubject.find((node) => [node.name, ...node.aliases].some((name) => normalize(name) === normalize(form.topic)));
    const topicChoice = selectedTopicNode?.id ?? (form.topic ? '__custom__' : '');
    function changeSubject(value: string) {
        const next = qbankSubjects.find((node) => node.id === value);
        update({ subject: next?.name ?? (value === '__custom__' ? '' : form.subject), topic: '' });
        setSelectedTaxonomy((current) => current.filter((id) => !qbankTopics.some((node) => node.id === id)));
    }
    function changeTopic(value: string) {
        const next = topicsForSubject.find((node) => node.id === value);
        update({ topic: next?.name ?? (value === '__custom__' ? '' : form.topic) });
        setSelectedTaxonomy((current) => [...current.filter((id) => !qbankTopics.some((node) => node.id === id)), ...(next ? [next.id] : [])]);
    }
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
        const completedOptions = form.options.filter((option) => option.text.trim());
        const invalidField = !form.examId ? 'exam' : !form.subject.trim() ? 'subject' : form.stem.trim().length < 10 ? 'stem' : completedOptions.length < 2 ? 'options' : !completedOptions.some((option) => option.id === form.answerKey) ? 'answer' : null;
        if (invalidField) {
            const validationMessages: Record<string, string> = {
                exam: 'Choose an exam before saving.',
                subject: 'Add a subject before saving.',
                stem: 'Write at least 10 characters in the question text.',
                options: 'Add text to at least two answer options.',
                answer: 'Add text to the option marked as correct.',
            };
            setMessage(validationMessages[invalidField]);
            const target = document.querySelector<HTMLElement>(`[data-question-field="${invalidField}"]`);
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target?.focus({ preventScroll: true });
            return;
        }
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
            const linkedTopicId = topicsForSubject.find((node) => [node.name, ...node.aliases].some((name) => normalize(name) === normalize(form.topic)))?.id;
            const taxonomyIds = [...new Set([...selectedTaxonomy.filter((id) => !qbankTopics.some((node) => node.id === id)), ...(linkedTopicId ? [linkedTopicId] : [])])];
            const taxonomyResponse = await fetch('/api/admin/questions/taxonomy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId, taxonomyIds }) });
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
            const rightsResponse = await fetch('/api/admin/questions/rights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId, rightsBasis: form.rightsBasis ?? 'unknown', sourceReference: form.sourceReference ?? '' }) });
            if (!rightsResponse.ok) {
                relatedUpdatesSucceeded = false;
                setMessage('Draft saved, but the source and image rights details could not be saved.');
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
    const filledOptions = form.options.filter((option) => option.text.trim());
    const qualityChecks = [
        ['Question text', Boolean(form.stem.trim())],
        ['Two or more answer options', filledOptions.length >= 2],
        ['Correct answer has text', filledOptions.some((option) => option.id === form.answerKey)],
        ['Subject selected', Boolean(form.subject.trim())],
        ['Explanation added', Boolean(form.explanation.trim())],
    ] as const;
    return <div className="editor-grid">
    <section className="card card-pad question-form-main">
      <div className="form-section form-section-media">
        <div className="section-title">Question image <span className="optional-label">Optional</span></div>
        <p className="form-hint">Upload a JPG, PNG, WebP or GIF from your phone or computer, or choose an image already in your library. You can attach more than one.</p>
        <MediaPicker media={media} selectedIds={form.mediaIds} canEdit={canEdit} onChange={(mediaIds) => update({ mediaIds })}/>
      </div>
      <div className="form-section">
        <div className="section-title">Question information</div>
        <div className="form-grid-2">
          <label className="field"><span>Exam <b className="required-mark">Required</b></span><select data-question-field="exam" required disabled={!canEdit} value={form.examId} onChange={(e) => update({ examId: e.target.value })}>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.code} — {exam.name}</option>)}</select></label>
          <label className="field"><span>Subject <b className="required-mark">Required</b></span>{qbankSubjects.length ? <select data-question-field="subject" required disabled={!canEdit} value={subjectChoice} onChange={(e) => changeSubject(e.target.value)}><option value="" disabled>Choose a subject</option>{qbankSubjects.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}<option value="__custom__">Other subject…</option></select> : null}{(!qbankSubjects.length || subjectChoice === '__custom__') && <input data-question-field="subject" required disabled={!canEdit} value={form.subject} onChange={(e) => update({ subject: e.target.value })} placeholder="Enter subject"/>}<small className="field-note">Choose a QBank subject so the question appears under the matching discipline.</small></label>
          <label className="field"><span>Topic</span>{topicsForSubject.length ? <select disabled={!canEdit} value={topicChoice} onChange={(e) => changeTopic(e.target.value)}><option value="">Choose a topic</option>{topicsForSubject.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}<option value="__custom__">Other topic…</option></select> : null}{(!topicsForSubject.length || topicChoice === '__custom__') && <input disabled={!canEdit} value={form.topic} onChange={(e) => update({ topic: e.target.value })} placeholder="Enter topic"/>}{topicsForSubject.length > 0 && <small className="field-note">Topics are loaded from the matching QBank discipline.</small>}</label><label className="field"><span>Recall key terms</span><input disabled={!canEdit} value={(form.keyTerms??[]).join(', ')} onChange={(e) => update({ keyTerms: e.target.value.split(',').map((v) => v.trim()).filter(Boolean).slice(0,3) })} placeholder="Hyperkalemia, peaked T waves, ECG"/><small className="field-note">Up to 3 short recall cues shown after answering.</small></label>
          <label className="field"><span>Difficulty</span><select disabled={!canEdit} value={form.difficulty ?? 3} onChange={(e) => update({ difficulty: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></label>
          <label className="field"><span>Source / reference</span><input disabled={!canEdit} value={form.sourceReference ?? ''} onChange={(e) => update({ sourceReference: e.target.value })} placeholder="Textbook, chapter, paper, or source URL"/></label>
          <label className="field"><span>Content rights basis</span><select disabled={!canEdit} value={form.rightsBasis ?? 'unknown'} onChange={(e) => update({ rightsBasis: e.target.value as Initial['rightsBasis'] })}><option value="unknown">Not yet confirmed</option><option value="original">Original content</option><option value="licensed">Licensed</option><option value="permission">Permission granted</option><option value="public_domain">Public domain</option><option value="user_submitted">User submitted</option></select><small className="field-note">This records the declared basis only; it does not verify the source or grant publishing permission.</small></label>
          <label className="field"><span>Historical reconstruction</span><select disabled={!canEdit} value={form.isReconstruction ? 'yes' : 'no'} onChange={(e) => update({ isReconstruction: e.target.value === 'yes' })}><option value="no">No</option><option value="yes">Yes — שחזור</option></select></label>
          {form.isReconstruction && <><label className="field"><span>Reconstruction year</span><input disabled={!canEdit} type="number" min={1900} max={2100} value={form.reconstructionYear ?? ''} onChange={(e) => update({ reconstructionYear: e.target.value ? Number(e.target.value) : null })} placeholder="2016"/></label><label className="field"><span>Reconstruction label</span><input disabled={!canEdit} value={form.reconstructionLabel ?? 'שחזור'} onChange={(e) => update({ reconstructionLabel: e.target.value })} placeholder="שחזור"/><small className="field-note">Displayed as a historical reconstruction label, not as an official exam publication.</small></label></>}
        </div>
      </div>
      <div className="form-section"><div className="section-title">Knowledge classification</div><div className="taxonomy-chips">{taxonomy.length ? taxonomy.map((node) => <label className="taxonomy-chip" key={node.id}><input type="checkbox" checked={selectedTaxonomy.includes(node.id)} disabled={!canEdit} onChange={(e) => setSelectedTaxonomy((current) => e.target.checked ? [...current, node.id] : current.filter((id) => id !== node.id))}/><span>{node.name}</span><small>{node.node_type}</small></label>) : <span className="form-hint">Create subjects in Taxonomy first.</span>}</div></div><div className="form-section"><div className="section-title">Question text</div><label className="field"><span>Question <b className="required-mark">Required · 10 characters minimum</b></span><textarea data-question-field="stem" required minLength={10} disabled={!canEdit} rows={9} value={form.stem} onChange={(e) => update({ stem: e.target.value })} placeholder="Write the full clinical question…"/></label></div>
      <div className="form-section"><div className="section-title">Answer options</div><p className="form-hint">Enter at least two choices, then select the radio button beside the correct answer.</p><div className="options-editor">{form.options.map((option) => <div className="option-row" key={option.id}><b>{option.id}</b><input data-question-field={option.id === form.answerKey ? 'answer' : undefined} disabled={!canEdit} value={option.text} onChange={(e) => updateOption(option.id, e.target.value)} placeholder={`Answer choice ${option.id}`} aria-label={`Answer option ${option.id}`}/><label className="correct-answer"><input disabled={!canEdit} className="radio" type="radio" name="answer" checked={form.answerKey === option.id} onChange={() => update({ answerKey: option.id })} aria-label={`Mark option ${option.id} correct`}/><span>Correct answer</span></label>{canEdit && form.options.length > 2 && <button className="btn option-remove" type="button" onClick={() => removeOption(option.id)} aria-label={`Remove option ${option.id}`}>Remove</button>}</div>)}</div>{canEdit && form.options.length < 10 && <button className="btn option-add" type="button" onClick={addOption}>+ Add option</button>}</div>
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
      <section className="card card-pad"><div className="panel-title">Quick tips</div><ul className="authoring-tips"><li>Keep the question focused on one learning objective.</li><li>Make answer choices clear and mutually distinct.</li><li>Mark one correct answer and explain why.</li><li>Use images only when they add useful clinical context.</li><li>Check image usage rights before publishing.</li></ul><a className="btn" href="/admin/media">Open media library</a></section>
      <section className="card card-pad"><div className="panel-title">Publishing</div><div className="security-note">{canPublishDirect ? 'Admin publishing is immediate and does not require independent medical review. Each change is versioned and audited.' : 'Answers stay behind the server boundary. Editors can submit drafts to the review queue.'}</div></section>
      <section className="card card-pad admin-authoring-checklist"><div className="panel-head"><div><div className="panel-title">Authoring checklist</div><div className="panel-sub">Completeness guidance only; it does not verify medical accuracy.</div></div></div><ul>{qualityChecks.map(([label, complete])=><li key={label} className={complete ? 'is-complete' : ''}><span aria-hidden="true">{complete ? '✓' : '○'}</span>{label}</li>)}</ul><div className="authoring-checklist-note">{form.mediaIds.length ? `${form.mediaIds.length} reusable media item${form.mediaIds.length === 1 ? '' : 's'} attached.` : 'Add reusable images or diagrams when the question needs them.'}</div></section>
    </aside>
  </div>;
}

