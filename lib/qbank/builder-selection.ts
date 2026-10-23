export type CategorySelection = {
  all: boolean;
  subjects: string[];
  topicIds: string[];
};

export type SelectionDiscipline = {
  value: string;
  topics: { id: string; isOthers: boolean }[];
};

export function toggleDisciplineSelection(
  current: CategorySelection,
  value: string,
  disciplines: SelectionDiscipline[],
): CategorySelection {
  if (current.all) {
    return { all: false, subjects: disciplines.map(d => d.value).filter(item => item !== value), topicIds: [] };
  }
  const topicIds = new Set(disciplines.find(d => d.value === value)?.topics.filter(t => !t.isOthers).map(t => t.id) ?? []);
  if (current.subjects.includes(value)) {
    return { all: false, subjects: current.subjects.filter(item => item !== value), topicIds: current.topicIds.filter(id => !topicIds.has(id)) };
  }
  return { all: false, subjects: [...current.subjects, value], topicIds: current.topicIds.filter(id => !topicIds.has(id)) };
}

export function toggleTopicSelection(
  current: CategorySelection,
  value: string,
  topicId: string,
  disciplines: SelectionDiscipline[],
): CategorySelection {
  const topicIds = new Set(disciplines.find(d => d.value === value)?.topics.filter(t => !t.isOthers).map(t => t.id) ?? []);
  let subjects = [...current.subjects];
  let selectedTopics = [...current.topicIds];
  if (current.all) {
    subjects = disciplines.map(d => d.value).filter(item => item !== value);
    selectedTopics = [...topicIds].filter(id => id !== topicId);
  } else if (subjects.includes(value)) {
    subjects = subjects.filter(item => item !== value);
    selectedTopics.push(...[...topicIds].filter(id => id !== topicId));
  } else if (selectedTopics.includes(topicId)) {
    selectedTopics = selectedTopics.filter(id => id !== topicId);
  } else {
    selectedTopics.push(topicId);
  }
  return { all: false, subjects: [...new Set(subjects)], topicIds: [...new Set(selectedTopics)] };
}

export function getDisciplineSelectionState(
  current: CategorySelection,
  discipline: SelectionDiscipline,
): { checked: boolean; partial: boolean; includesOthers: boolean } {
  const checked = current.all || current.subjects.includes(discipline.value);
  const partial = !checked && discipline.topics.some(topic => current.topicIds.includes(topic.id));
  return { checked, partial, includesOthers: checked };
}
