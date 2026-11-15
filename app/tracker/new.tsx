import { useCallback, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { getSpaceStates, setSpaceEnabled, type SpaceState } from '../../src/spaces';
import {
  AppText,
  Card,
  Chip,
  ChipRow,
  IconBadge,
  Screen,
  ScreenHeader,
  SectionHeader,
  useInputStyle,
  useTheme,
  useToast,
} from '../../src/ui/components';
import { radius, space, TOUCH } from '../../src/ui/theme';
import {
  createTrackerFromTemplate,
  listTrackers,
  updateTracker,
} from '../../src/tracker/repository';
import {
  TEMPLATE_CATEGORIES,
  searchTemplates,
  suggestTemplates,
} from '../../src/tracker/templates';
import type { Tracker, TrackerTemplate } from '../../src/tracker/types';

const DEDICATED_SPACES = [
  {
    key: 'finance',
    title: 'Finance',
    blurb: 'Spending, income, budgets and savings goals.',
    accent: '#1F9D6B',
    route: '/finance',
    includes: ['Add an expense in 3 taps', 'Spending pace vs last month', 'Where your money went', 'Budgets and recurring payments'],
  },
  {
    key: 'workout',
    title: 'Workout',
    blurb: 'Routines, a gym-floor workout screen, rest timer and records.',
    accent: '#E5533D',
    route: '/workout',
    includes: ['Start a routine in one tap', 'Sets prefilled from last time', 'Rest timer and personal records', 'Progress over time'],
  },
  {
    key: 'wardrobe',
    title: 'Wardrobe',
    blurb: 'Your digital closet: photos, outfits, a wishlist and what to wear.',
    accent: '#C2738A',
    route: '/wardrobe',
    includes: ['Closet shelves with photos', 'Build outfits on a canvas', 'What can I wear?', 'Wishlist and inspiration'],
  },
  {
    key: 'social',
    title: 'Social',
    blurb: 'Remember people well, capture moments, and grow your social life.',
    accent: '#7C5CE0',
    route: '/social',
    includes: ['Met someone: just a name', 'What to remember about each person', 'Birthdays and promises', 'Social challenges'],
  },
];

type TemplateState = 'active' | 'inactive' | 'none';

export default function AddSpace() {
  const router = useRouter();
  const t = useTheme();
  const inputStyle = useInputStyle();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [spaces, setSpaces] = useState<Map<string, SpaceState>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [nextTrackers, nextSpaces] = await Promise.all([listTrackers(true), getSpaceStates()]);
    setTrackers(nextTrackers);
    setSpaces(nextSpaces);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const stateFor = (template: TrackerTemplate): { state: TemplateState; tracker?: Tracker } => {
    const matches = trackers.filter((tr) => tr.template_key === template.key);
    const active = matches.find((tr) => tr.status === 'active');
    if (active) return { state: 'active', tracker: active };
    if (matches.length > 0) return { state: 'inactive', tracker: matches[0] };
    return { state: 'none' };
  };

  const add = async (template: TrackerTemplate, state: TemplateState, tracker?: Tracker) => {
    if (busy) return;
    setBusy(template.key);
    try {
      if (state === 'inactive' && tracker) {
        await updateTracker(tracker.id, { status: 'active' });
        toast.show(`${template.title} restored with everything in it`);
      } else {
        await createTrackerFromTemplate(template);
        toast.show(`${template.title} added`);
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const openTracker = (tracker?: Tracker) => {
    if (!tracker) return;
    router.push({ pathname: '/tracker/[id]', params: { id: tracker.id } });
  };

  const openSpace = async (key: string, route: string) => {
    const current = spaces.get(key);
    if (!current?.enabled) {
      await setSpaceEnabled(key, true);
      await load();
    }
    router.push(route as never);
  };

  const filtering = search.trim().length > 0 || category !== null;
  const results = searchTemplates(search, category);
  const suggestions = filtering ? [] : suggestTemplates(trackers, 3);

  return (
    <Screen>
      <ScreenHeader
        title="Add a Space"
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/' as never);
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons
          name="search"
          size={20}
          color={t.textMuted}
          style={{ position: 'absolute', left: space.md, zIndex: 1 }}
        />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search, e.g. gym, mood, spending"
          placeholderTextColor={t.textMuted}
          style={[inputStyle, { flex: 1, paddingLeft: 40 }]}
        />
      </View>

      <Card
        onPress={() => router.push('/tracker/edit' as never)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderColor: t.primary, borderWidth: 1.5 }}
      >
        <IconBadge icon="construct" color={t.primary} />
        <View style={{ flex: 1 }}>
          <AppText size={16} weight="700">
            Create your own
          </AppText>
          <AppText size={13} muted>
            Pick the name, the fields, how often and reminders.
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={20} color={t.textMuted} />
      </Card>

      {!filtering ? (
        <>
          <SectionHeader title="Built for one thing" />
          {DEDICATED_SPACES.map((item) => {
            const current = spaces.get(item.key);
            const label = current?.enabled ? 'Open' : current ? 'Restore' : 'Add';
            return (
              <Card key={item.key} style={{ gap: space.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <AppText size={17} weight="700">
                      {item.title}
                    </AppText>
                    <AppText size={13} muted>
                      {item.blurb}
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => openSpace(item.key, item.route)}
                    accessibilityLabel={`${label} ${item.title}`}
                    style={{
                      minHeight: 40,
                      minWidth: TOUCH + 12,
                      paddingHorizontal: space.md,
                      borderRadius: radius.pill,
                      backgroundColor: item.accent,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AppText size={14} weight="700" color="#fff">
                      {label}
                    </AppText>
                  </Pressable>
                </View>
                <AppText size={12} muted>
                  {item.includes.join(' · ')}
                </AppText>
              </Card>
            );
          })}
        </>
      ) : null}

      {suggestions.length > 0 ? (
        <>
          <SectionHeader title="Suggested for you" />
          {suggestions.map(({ template, reason }) => (
            <TemplateCard
              key={template.key}
              template={template}
              state={stateFor(template)}
              reason={reason}
              busy={busy === template.key}
              onAdd={() => {
                const current = stateFor(template);
                add(template, current.state, current.tracker);
              }}
              onOpen={() => openTracker(stateFor(template).tracker)}
            />
          ))}
        </>
      ) : null}

      <SectionHeader title={filtering ? 'Results' : 'All trackers'} />
      <ChipRow>
        <Chip label="All" selected={category === null} onPress={() => setCategory(null)} />
        {TEMPLATE_CATEGORIES.map((item) => (
          <Chip
            key={item}
            label={item}
            selected={category === item}
            onPress={() => setCategory(category === item ? null : item)}
          />
        ))}
      </ChipRow>

      {results.length === 0 ? (
        <AppText muted>Nothing matches. Try another word, or create your own above.</AppText>
      ) : (
        results.map((template) => {
          const current = stateFor(template);
          return (
            <TemplateCard
              key={template.key}
              template={template}
              state={current}
              busy={busy === template.key}
              onAdd={() => add(template, current.state, current.tracker)}
              onOpen={() => openTracker(current.tracker)}
            />
          );
        })
      )}

      <AppText size={13} muted>
        Everything here is just a starting point. Open a tracker afterwards to change any field, frequency or reminder.
      </AppText>
    </Screen>
  );
}

function TemplateCard({
  template,
  state,
  reason,
  busy,
  onAdd,
  onOpen,
}: {
  template: TrackerTemplate;
  state: { state: TemplateState; tracker?: Tracker };
  reason?: string;
  busy?: boolean;
  onAdd: () => void;
  onOpen: () => void;
}) {
  const t = useTheme();
  const labels = template.draft.fields.slice(0, 4).map((field) => field.label);
  const active = state.state === 'active';
  const inactive = state.state === 'inactive';
  const buttonLabel = inactive ? 'Restore' : 'Add';

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <IconBadge icon={template.draft.icon} color={template.draft.color} />
        <View style={{ flex: 1 }}>
          <AppText size={16} weight="700">
            {template.title}
          </AppText>
          <AppText size={13} muted>
            {template.blurb}
          </AppText>
        </View>
        {active ? (
          <Pressable
            onPress={onOpen}
            accessibilityLabel={`Open ${template.title}`}
            style={{
              minHeight: 40,
              paddingHorizontal: space.md,
              borderRadius: radius.pill,
              backgroundColor: t.surfaceAlt,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="checkmark" size={18} color={t.success} />
            <AppText size={13} weight="700" color={t.success}>
              Added
            </AppText>
          </Pressable>
        ) : (
          <Pressable
            onPress={onAdd}
            disabled={busy}
            accessibilityLabel={`${buttonLabel} ${template.title}`}
            style={{
              minHeight: 40,
              minWidth: TOUCH + 12,
              paddingHorizontal: space.md,
              borderRadius: radius.pill,
              backgroundColor: template.draft.color,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: busy ? 0.6 : 1,
            }}
          >
            <AppText size={14} weight="700" color="#fff">
              {buttonLabel}
            </AppText>
          </Pressable>
        )}
      </View>

      <AppText size={12} muted>
        {`Records: ${labels.join(' · ')}${template.draft.fields.length > 4 ? ' …' : ''}`}
      </AppText>

      {reason ? (
        <AppText size={12} weight="700" color={template.draft.color}>
          {reason}
        </AppText>
      ) : null}

      {inactive && state.tracker ? (
        <AppText size={12} muted>
          {`You have this ${state.tracker.status}. Restoring brings back all its history.`}
        </AppText>
      ) : null}
    </Card>
  );
}
