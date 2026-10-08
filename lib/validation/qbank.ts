import { z } from 'zod';
export const startSessionSchema = z.object({
  examId: z.string().uuid(),
  subjects: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  topics: z.array(z.string().trim().min(1).max(180)).max(100).default([]),
  questionCount: z.number().int().min(1).max(300),
  mode: z.enum(['practice','exam']),
  pool: z.enum(['mixed','unseen','incorrect','answered','unanswered','bookmarked']).default('mixed'),
  reconstructionYear: z.number().int().min(1900).max(2100).nullable().optional()
});
export const sessionAnswerSchema = z.object({
  position: z.number().int().min(1).max(300),
  selectedAnswer: z.string().trim().min(1).max(20),
  durationMs: z.number().int().min(0).max(3600000).nullable().optional(),
  confidence: z.number().int().min(1).max(5).nullable().optional(),
  mutationId: z.string().uuid()
});
export const sessionStateSchema = z.object({
  position: z.number().int().min(1).max(300),
  marked: z.boolean().nullable().optional(),
  note: z.string().max(5000).nullable().optional()
});
