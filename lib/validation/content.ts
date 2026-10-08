import { z } from 'zod';
const httpUrl = z.string().url().refine((value) => /^https?:\/\//i.test(value), 'Only HTTP(S) URLs are allowed.');
export const questionOptionSchema = z.object({
    id: z.string().trim().min(1).max(20).regex(/^[A-Z0-9_-]+$/i),
    text: z.string().trim().min(1).max(5000),
});
export const createQuestionSchema = z.object({
    id: z.string().uuid().optional(),
    examId: z.string().uuid(),
    stem: z.string().trim().min(10).max(20000),
    subject: z.string().trim().min(1).max(120),
    topic: z.string().trim().max(120).optional().default(''),
    options: z.array(questionOptionSchema).min(2).max(10),
    answerKey: z.string().trim().min(1).max(20),
    explanation: z.string().trim().max(30000).optional().default(''),
    keyLearningPoint: z.string().trim().max(5000).optional().default(''),
    difficulty: z.number().int().min(1).max(5).nullable().default(3),
    mediaIds: z.array(z.string().uuid()).max(20).default([]),
}).superRefine((value, ctx) => {
    const ids = value.options.map((option) => option.id.toUpperCase());
    if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Option IDs must be unique.' });
    if (!ids.includes(value.answerKey.toUpperCase()))
        ctx.addIssue({ code: 'custom', path: ['answerKey'], message: 'Correct answer must match one option.' });
});
export const answerSchema = z.object({
    questionId: z.string().uuid(),
    selectedAnswer: z.string().trim().min(1).max(20),
    durationMs: z.number().int().min(0).max(3600000).nullable().optional(),
    confidence: z.number().int().min(1).max(5).nullable().optional(),
    mutationId: z.string().uuid(),
});
export const mediaSchema = z.object({
    kind: z.enum(['image', 'ecg', 'xray', 'ct', 'mri', 'pathology', 'diagram', 'video', 'audio', 'document']),
    title: z.string().trim().min(1).max(180),
    altText: z.string().trim().max(1000).optional().default(''),
    externalUrl: httpUrl.optional().or(z.literal('')).default(''),
    storagePath: z.string().trim().max(500).optional().or(z.literal('')).default(''),
    mimeType: z.string().max(120).optional().default(''),
    sourceId: z.string().uuid().nullable().optional(),
    licenseName: z.string().trim().max(180).optional().default(''),
    licenseUrl: httpUrl.optional().or(z.literal('')).default(''),
    attributionText: z.string().max(1000).optional().default(''),
    copyrightStatus: z.enum(['original', 'public_domain', 'licensed', 'review_required']).default('review_required'),
    commercialUseAllowed: z.boolean().nullable().default(null),
    attributionRequired: z.boolean().default(false),
}).superRefine((value, ctx) => {
    if (!value.externalUrl && !value.storagePath)
        ctx.addIssue({ code: 'custom', path: ['externalUrl'], message: 'Add an external URL or storage path.' });
});
export const knowledgeCardSchema = z.object({
    title: z.string().trim().min(2).max(180),
    summary: z.string().trim().max(2000).default(''),
    bodyMd: z.string().trim().min(10).max(50000),
});
export const aiJobSchema = z.object({
    questionId: z.string().uuid().nullable().optional(),
    jobType: z.enum(['question_suggestion', 'explanation_suggestion', 'taxonomy_suggestion', 'knowledge_suggestion']),
    input: z.record(z.string(), z.unknown()).default({}),
}).superRefine((value, ctx) => {
    if (JSON.stringify(value.input).length > 100000)
        ctx.addIssue({ code: 'custom', path: ['input'], message: 'Input is too large.' });
});

