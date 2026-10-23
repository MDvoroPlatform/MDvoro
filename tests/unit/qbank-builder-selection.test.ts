import { describe, expect, it } from 'vitest';
import { getDisciplineSelectionState, toggleDisciplineSelection, toggleTopicSelection, type SelectionDiscipline } from '@/lib/qbank/builder-selection';

const disciplines: SelectionDiscipline[] = [
  { value: 'Medicine', topics: [{ id: 'cardio', isOthers: false }, { id: 'renal', isOthers: false }, { id: 'others', isOthers: true }] },
  { value: 'Pediatrics', topics: [{ id: 'growth', isOthers: false }, { id: 'ped-others', isOthers: true }] },
];

describe('QBank builder discipline and topic selection', () => {
  it('selects a whole discipline and includes its Others bucket', () => {
    const selection = toggleDisciplineSelection({ all: false, subjects: [], topicIds: [] }, 'Medicine', disciplines);
    expect(selection.subjects).toEqual(['Medicine']);
    expect(getDisciplineSelectionState(selection, disciplines[0])).toEqual({ checked: true, partial: false, includesOthers: true });
  });

  it('selects a single topic without including sibling topics or Others', () => {
    const selection = toggleTopicSelection({ all: false, subjects: [], topicIds: [] }, 'Medicine', 'cardio', disciplines);
    expect(selection).toEqual({ all: false, subjects: [], topicIds: ['cardio'] });
    expect(getDisciplineSelectionState(selection, disciplines[0])).toEqual({ checked: false, partial: true, includesOthers: false });
  });

  it('includes Others only for an all-discipline or whole-discipline selection', () => {
    expect(getDisciplineSelectionState({ all: true, subjects: [], topicIds: [] }, disciplines[0]).includesOthers).toBe(true);
    expect(getDisciplineSelectionState({ all: false, subjects: ['Medicine'], topicIds: [] }, disciplines[0]).includesOthers).toBe(true);
    expect(getDisciplineSelectionState({ all: false, subjects: [], topicIds: ['cardio', 'renal'] }, disciplines[0]).includesOthers).toBe(false);
  });
});
