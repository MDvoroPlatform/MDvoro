export type UserRole = 'student' | 'admin' | 'editor' | 'reviewer' | 'support';
export type WorkflowStatus = 'draft' | 'in_review' | 'published' | 'archived';
export type AccessTier = 'free' | 'premium';

export type Exam = { id: string; code: string; name: string; description: string | null };
export type Profile = { id: string; full_name: string | null; avatar_url: string | null; role: UserRole; active_exam_id: string | null };
export type QuestionOption = { id: string; text: string };
export type QuestionMedia = { id: string; kind: string; title: string; alt_text: string | null; external_url: string | null; caption: string | null; position: number };
export type PublicQuestion = { id: string; content_code: string | null; exam_id: string; stem: string; subject: string; topic: string | null; options: QuestionOption[]; difficulty: number | null; media: QuestionMedia[] };
export type AdminQuestionStatus = WorkflowStatus;
export type MediaAsset = { id: string; kind: string; title: string; external_url: string | null; storage_path: string | null; license_name: string | null; copyright_status: string; usage_count?: number };

export type TaxonomyNode = { id: string; parent_id: string | null; node_type: string; slug: string; name: string; description: string | null; status: string; sort_order: number; child_count: number };
