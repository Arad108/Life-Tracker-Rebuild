import type { TrackerTemplate } from './types';

/**
 * The 11 built-in templates, transcribed from the shipped bundle
 * (decompiled2.js:616826-617369). `title`/`blurb` are the gallery copy;
 * `draft` is what actually gets installed as a tracker.
 */
export const TEMPLATES: TrackerTemplate[] = [
  {
    key: 'water',
    title: 'Water',
    blurb: 'Log each drink. Optional daily goal.',
    category: 'Health',
    tags: ['hydration', 'drink', 'health'],
    suggestAfter: ['workout', 'food'],
    draft: {
      name: 'Water',
      description: 'How much water I drink.',
      icon: 'water',
      color: '#0EA5E9',
      showOnDashboard: true,
      fields: [{ key: 'amount', label: 'Amount', type: 'number', unit: 'ml', required: true }],
      config: {
        summaries: [{ agg: 'sum', fieldKey: 'amount', label: 'today', unit: 'ml' }],
        quickAdd: { fieldKey: 'amount', values: [250, 500, 750] },
        schedule: { kind: 'none' },
        titleFieldKey: 'amount',
      },
    },
  },
  {
    key: 'food',
    title: 'Food',
    blurb: 'What you ate and when. No calories required.',
    category: 'Health',
    tags: ['meals', 'eating', 'diet'],
    suggestAfter: ['water', 'workout'],
    draft: {
      name: 'Food',
      description: 'Meals and snacks.',
      icon: 'restaurant',
      color: '#F97316',
      showOnDashboard: true,
      fields: [
        { key: 'meal', label: 'Meal', type: 'select', options: ['Breakfast', 'Lunch', 'Dinner', 'Snack'], required: true },
        { key: 'what', label: 'What did you eat?', type: 'text', required: true },
        { key: 'portion', label: 'Portion', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'notes' },
      ],
      config: {
        summaries: [{ agg: 'count', fieldKey: null, label: 'meals' }],
        schedule: { kind: 'none' },
        titleFieldKey: 'what',
      },
    },
  },
  {
    key: 'workout',
    title: 'Workout',
    blurb: 'Exercises with weight, sets and reps.',
    category: 'Health',
    tags: ['gym', 'exercise', 'fitness', 'strength', 'sets', 'reps'],
    suggestAfter: ['water', 'food'],
    draft: {
      name: 'Workout',
      description: 'Gym and exercise log.',
      icon: 'barbell',
      color: '#EF4444',
      showOnDashboard: true,
      fields: [
        { key: 'exercise', label: 'Exercise', type: 'text', required: true },
        { key: 'weight', label: 'Weight', type: 'decimal', unit: 'kg' },
        { key: 'sets', label: 'Sets', type: 'number' },
        { key: 'reps', label: 'Reps', type: 'number' },
        { key: 'duration', label: 'Duration', type: 'duration' },
        { key: 'notes', label: 'Notes', type: 'notes' },
      ],
      config: {
        summaries: [
          { agg: 'count', fieldKey: null, label: 'exercises' },
          { agg: 'sum', fieldKey: 'sets', label: 'sets' },
          { agg: 'sum', fieldKey: 'duration', label: 'time' },
        ],
        schedule: { kind: 'none' },
        titleFieldKey: 'exercise',
      },
    },
  },
  {
    key: 'sleep',
    title: 'Sleep',
    blurb: 'Hours slept and how rested you feel.',
    category: 'Health',
    tags: ['rest', 'bedtime', 'night'],
    suggestAfter: ['workout', 'journal'],
    draft: {
      name: 'Sleep',
      description: '',
      icon: 'moon',
      color: '#6366F1',
      showOnDashboard: true,
      fields: [
        { key: 'slept', label: 'Time asleep', type: 'duration', required: true },
        { key: 'quality', label: 'How rested?', type: 'rating' },
        { key: 'notes', label: 'Notes', type: 'notes' },
      ],
      config: {
        presentation: 'log',
        summaries: [{ agg: 'avg', fieldKey: 'slept', label: 'average' }],
        schedule: { kind: 'daily' },
        titleFieldKey: 'slept',
      },
    },
  },
  {
    key: 'weight',
    title: 'Body weight',
    blurb: 'Only if you want it. Track weight over time.',
    category: 'Health',
    tags: ['body', 'scale', 'kg'],
    draft: {
      name: 'Body weight',
      description: '',
      icon: 'speedometer',
      color: '#14B8A6',
      showOnDashboard: false,
      fields: [
        { key: 'kg', label: 'Weight', type: 'decimal', unit: 'kg', required: true },
        { key: 'notes', label: 'Notes', type: 'notes' },
      ],
      config: {
        presentation: 'log',
        summaries: [{ agg: 'avg', fieldKey: 'kg', label: 'average', unit: 'kg' }],
        schedule: { kind: 'none' },
        titleFieldKey: 'kg',
      },
    },
  },
  {
    key: 'habit',
    title: 'Daily habit',
    blurb: 'Something you want to do regularly.',
    category: 'Lifestyle',
    tags: ['routine', 'streak', 'daily', 'custom'],
    draft: {
      name: 'New habit',
      description: '',
      icon: 'checkmark-circle',
      color: '#10B981',
      showOnDashboard: true,
      fields: [
        { key: 'done', label: 'Completed', type: 'boolean', required: true },
        { key: 'duration', label: 'Duration', type: 'duration' },
        { key: 'notes', label: 'Notes', type: 'notes' },
      ],
      config: {
        summaries: [{ agg: 'count', fieldKey: null, label: 'times' }],
        defaults: { done: true },
        schedule: { kind: 'daily' },
        titleFieldKey: 'done',
      },
    },
  },
  {
    key: 'meditation',
    title: 'Meditation',
    blurb: 'Minutes of stillness each day.',
    category: 'Mind',
    tags: ['mindfulness', 'calm', 'breathing'],
    suggestAfter: ['sleep', 'journal'],
    draft: {
      name: 'Meditation',
      description: '',
      icon: 'leaf',
      color: '#22C55E',
      showOnDashboard: true,
      fields: [
        { key: 'duration', label: 'Duration', type: 'duration', required: true },
        { key: 'notes', label: 'Notes', type: 'notes' },
      ],
      config: {
        summaries: [{ agg: 'sum', fieldKey: 'duration', label: 'today' }],
        schedule: { kind: 'daily' },
        titleFieldKey: 'duration',
      },
    },
  },
  {
    key: 'reading',
    title: 'Reading',
    blurb: 'Books and pages, time spent reading.',
    category: 'Mind',
    tags: ['books', 'pages', 'study'],
    suggestAfter: ['learning'],
    draft: {
      name: 'Reading',
      description: '',
      icon: 'book',
      color: '#A855F7',
      showOnDashboard: true,
      fields: [
        { key: 'title', label: 'Book or article', type: 'text', required: true },
        { key: 'pages', label: 'Pages', type: 'number' },
        { key: 'duration', label: 'Time', type: 'duration' },
        { key: 'notes', label: 'Notes', type: 'notes' },
      ],
      config: {
        summaries: [
          { agg: 'sum', fieldKey: 'pages', label: 'pages' },
          { agg: 'sum', fieldKey: 'duration', label: 'time' },
        ],
        schedule: { kind: 'none' },
        titleFieldKey: 'title',
      },
    },
  },
  {
    key: 'learning',
    title: 'Learning',
    blurb: 'Study sessions for any skill or language.',
    category: 'Mind',
    tags: ['study', 'language', 'course', 'skill', 'practice'],
    suggestAfter: ['reading'],
    draft: {
      name: 'Learning',
      description: 'What I am learning.',
      icon: 'school',
      color: '#8B5CF6',
      showOnDashboard: true,
      fields: [
        { key: 'subject', label: 'Subject', type: 'text', required: true },
        { key: 'duration', label: 'Time studied', type: 'duration' },
        { key: 'learned', label: 'What I learned', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'notes' },
      ],
      config: {
        summaries: [{ agg: 'sum', fieldKey: 'duration', label: 'studied' }],
        schedule: { kind: 'none' },
        titleFieldKey: 'subject',
      },
    },
  },
  {
    key: 'journal',
    title: 'Journal',
    blurb: 'A mood rating and a few lines about your day.',
    category: 'Mind',
    tags: ['mood', 'reflection', 'diary', 'gratitude'],
    suggestAfter: ['sleep', 'meditation'],
    draft: {
      name: 'Journal',
      description: 'Daily reflection.',
      icon: 'create',
      color: '#F59E0B',
      showOnDashboard: true,
      fields: [
        { key: 'mood', label: 'Mood', type: 'rating' },
        { key: 'highlight', label: 'Highlight of the day', type: 'text' },
        { key: 'notes', label: 'Thoughts', type: 'notes' },
      ],
      config: {
        summaries: [{ agg: 'avg', fieldKey: 'mood', label: 'avg mood' }],
        schedule: { kind: 'daily' },
        titleFieldKey: 'highlight',
      },
    },
  },
  {
    key: 'social',
    title: 'Social log',
    blurb: 'People and moments worth remembering.',
    category: 'Social',
    tags: ['people', 'friends', 'networking', 'conversation'],
    draft: {
      name: 'Social',
      description: 'Interactions I want to reflect on.',
      icon: 'people',
      color: '#EC4899',
      showOnDashboard: true,
      fields: [
        { key: 'person', label: 'Who', type: 'text', required: true },
        { key: 'isNew', label: 'New person', type: 'boolean' },
        { key: 'context', label: 'Context', type: 'select', options: ['Professional', 'Friendship', 'Fun', 'Networking', 'Personal', 'Other'] },
        { key: 'liked', label: 'What I liked', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'notes' },
      ],
      config: {
        summaries: [{ agg: 'count', fieldKey: null, label: 'interactions' }],
        schedule: { kind: 'none' },
        titleFieldKey: 'person',
      },
    },
  },
];

export const TEMPLATE_CATEGORIES = ['Health', 'Money', 'Mind', 'Social', 'Lifestyle'] as const;

/** Icons offered when editing a tracker (decompiled2.js:617371). */
export const TRACKER_ICONS = [
  'water', 'restaurant', 'barbell', 'checkmark-circle', 'school', 'people', 'book',
  'bicycle', 'walk', 'moon', 'sunny', 'heart', 'musical-notes', 'chatbubbles',
  'cash', 'cart', 'shirt', 'leaf', 'flame', 'star', 'medkit', 'brush',
  'game-controller', 'code-slash',
];

/** Colours offered when editing a tracker (decompiled2.js:617373). */
export const TRACKER_COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#F97316', '#EF4444', '#EC4899', '#8B5CF6'];

export function templateByKey(key: string | null | undefined): TrackerTemplate | undefined {
  if (!key) return undefined;
  return TEMPLATES.find((t) => t.key === key);
}

/** Mirrors the shipped search: category, then title/blurb/tags contains. */
export function searchTemplates(query: string, category: string | null): TrackerTemplate[] {
  const q = query.trim().toLowerCase();
  return TEMPLATES.filter((t) => {
    if (category && t.category !== category) return false;
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.blurb.toLowerCase().includes(q) ||
      (t.tags ?? []).some((tag) => tag.includes(q))
    );
  });
}

export interface TemplateSuggestion {
  template: TrackerTemplate;
  reason: string;
}

/**
 * "Suggested for you": pair-aware suggestions first ("Pairs well with Water
 * & Food"), then popular starters when there is nothing to pair with.
 */
export function suggestTemplates(trackers: { template_key: string | null }[], limit = 3): TemplateSuggestion[] {
  const installed = new Set(trackers.map((t) => t.template_key).filter((k): k is string => !!k));
  const out: TemplateSuggestion[] = [];
  const suggested = new Set<string>();

  for (const template of TEMPLATES) {
    if (out.length >= limit) break;
    const matched = (template.suggestAfter ?? []).filter((key) => installed.has(key));
    if (matched.length === 0) continue;
    if (installed.has(template.key) || suggested.has(template.key)) continue;
    const titles = matched.map((key) => TEMPLATES.find((t) => t.key === key)?.title ?? key);
    suggested.add(template.key);
    out.push({ template, reason: `Pairs well with ${titles.join(' & ')}` });
  }

  if (out.length === 0) {
    for (const key of ['water', 'journal', 'habit']) {
      if (out.length >= limit) break;
      const template = TEMPLATES.find((t) => t.key === key);
      if (!template || installed.has(key) || suggested.has(key)) continue;
      suggested.add(key);
      out.push({ template, reason: 'A popular place to start' });
    }
  }

  return out;
}
