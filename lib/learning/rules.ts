export type SmartSnapshot = {
    version: number;
    ai_enabled: false;
    learner_state: 'new' | 'recovery' | 'building' | 'strong' | 'advanced';
    overall: {
        attempts: number;
        accuracy: number;
        avg_seconds: number;
        avg_confidence: number;
    };
    today: {
        attempts_today: number;
        correct_today: number;
    };
    week: {
        attempts_7d: number;
        correct_7d: number;
    };
    streak_days: number;
    due_cards: number;
    plan: {
        daily_minutes: number;
        daily_questions: number;
        days_remaining: number | null;
        target_date: string | null;
        exam_id: string | null;
    };
    confidence: {
        high_confidence_accuracy: number;
        low_confidence_accuracy: number;
    };
    weak_topics: Array<{
        topic: string;
        attempts: number;
        accuracy: number;
        last_attempt_at: string;
        avg_seconds: number;
    }>;
    recommendations: Array<{
        type: string;
        priority: number;
        title: string;
        reason: string;
        target_count?: number;
        topic?: string;
    }>;
};
export function learnerStateLabel(state: SmartSnapshot['learner_state']) {
    return { new: 'New learner', recovery: 'Recovery mode', building: 'Building mastery', strong: 'Strong performance', advanced: 'Advanced performance' }[state];
}

