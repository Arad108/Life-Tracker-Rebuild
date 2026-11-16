import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GUTTER, radius, space, TOUCH, useTheme, type ThemeColors } from './theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type Weight = '400' | '500' | '600' | '700' | '800' | '900' | 'bold';

/** Same mapping as the shipped app's fontFamilyFor(). */
export function fontFamilyFor(weight: Weight): string {
  switch (weight) {
    case '500':
      return 'Inter_500Medium';
    case '600':
      return 'Inter_600SemiBold';
    case '700':
    case '800':
    case '900':
    case 'bold':
      return 'Inter_700Bold';
    default:
      return 'Inter_400Regular';
  }
}

export function useInputStyle(): TextStyle {
  const t = useTheme();
  return {
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    paddingHorizontal: space.md,
    color: t.text,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  };
}

export function Screen({
  children,
  scroll = true,
  padBottom = 24,
  topInset = true,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padBottom?: number;
  topInset?: boolean;
  contentStyle?: ViewStyle;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const base = { backgroundColor: t.bg, paddingTop: topInset ? insets.top : 0 };
  if (!scroll) {
    return <View style={[styles.flex, base, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView
      style={[styles.flex, base]}
      contentContainerStyle={[
        { padding: space.lg, paddingBottom: padBottom + insets.bottom, gap: space.md },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function AppText({
  children,
  size = 15,
  weight = '400',
  muted,
  color,
  style,
  numberOfLines,
  align,
  numeric,
}: {
  children?: React.ReactNode;
  size?: number;
  weight?: Weight;
  muted?: boolean;
  color?: string;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
  align?: 'left' | 'center' | 'right';
  numeric?: boolean;
}) {
  const t = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontSize: size,
          fontFamily: fontFamilyFor(weight),
          color: color ?? (muted ? t.textMuted : t.text),
          textAlign: align,
        },
        numeric ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return (
    <AppText size={28} weight="700">
      {children}
    </AppText>
  );
}

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityLabel="Go back"
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons name="arrow-back" size={24} color={t.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <AppText size={22} weight="700" numberOfLines={1}>
          {title}
        </AppText>
      </View>
      {right}
    </View>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <AppText
        size={13}
        weight="700"
        muted
        style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}
      >
        {title}
      </AppText>
      {action}
    </View>
  );
}

export function Card({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const cardStyle: ViewStyle = {
    backgroundColor: t.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: space.lg,
  };
  if (!onPress) {
    return <View style={[cardStyle, style]}>{children}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: t.surfaceAlt }}
      style={({ pressed }) => [cardStyle, style, pressed ? { opacity: 0.85 } : null]}
    >
      {children}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  color,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  color?: string;
}) {
  const t = useTheme();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const isGhost = variant === 'ghost';
  const bg = isPrimary ? color ?? t.primary : isDanger ? t.danger : variant === 'secondary' ? t.surfaceAlt : 'transparent';
  const fg = isPrimary || isDanger ? t.onPrimary : isGhost ? color ?? t.primary : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
      style={[
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
          <AppText weight="600" color={fg}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  icon?: IconName;
}) {
  const t = useTheme();
  const accent = color ?? t.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? accent : t.border,
          backgroundColor: selected ? accent : t.surface,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={16} color={selected ? t.onPrimary : accent} />
      ) : null}
      <AppText size={14} weight="600" color={selected ? t.onPrimary : t.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function IconBadge({
  icon,
  color,
  size = 44,
}: {
  icon: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}26`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon as IconName} size={size * 0.5} color={color} />
    </View>
  );
}

export function ProgressBar({ value, color }: { value: number; color: string }) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ width: `${clamped * 100}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

export function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <AppText weight="500">{label}</AppText>
        {hint ? (
          <AppText size={13} muted>
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: t.primary, false: t.border }}
      />
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: space.sm }}>
      <Ionicons name={icon} size={44} color={t.textMuted} />
      <AppText size={17} weight="600">
        {title}
      </AppText>
      {body ? (
        <AppText muted style={{ textAlign: 'center' }}>
          {body}
        </AppText>
      ) : null}
      {action ? <View style={{ marginTop: space.sm }}>{action}</View> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={[styles.flex, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator />
    </View>
  );
}

export function TextField({ style, multiline, ...props }: TextInputProps) {
  const inputStyle = useInputStyle();
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.textMuted}
      multiline={multiline}
      style={[
        inputStyle,
        multiline ? { minHeight: 96, textAlignVertical: 'top', paddingTop: space.md } : null,
        style,
      ]}
      {...props}
    />
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

export function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

export interface ToastApi {
  show: (input: string | ToastOptions) => void;
}

const ToastContext = React.createContext<ToastApi>({ show: () => {} });

/** Same toast surface as the shipped app: inverted card above the tab bar. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = React.useState<(ToastOptions & { id: number }) | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setCurrent(null);
  }, []);

  const show = React.useCallback((input: string | ToastOptions) => {
    const options: ToastOptions = typeof input === 'string' ? { message: input } : input;
    if (timer.current) clearTimeout(timer.current);
    const item = { ...options, id: Date.now() + Math.random() };
    setCurrent(item);
    timer.current = setTimeout(() => {
      setCurrent((cur) => (cur && cur.id === item.id ? null : cur));
    }, options.duration ?? 4000);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {current ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: insets.bottom + 84 }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              minHeight: 52,
              paddingHorizontal: space.lg,
              borderRadius: radius.md,
              backgroundColor: t.text,
            }}
          >
            <View style={{ flex: 1 }}>
              <AppText size={15} color={t.bg} numberOfLines={2}>
                {current.message}
              </AppText>
            </View>
            {current.actionLabel ? (
              <Pressable
                onPress={() => {
                  current.onAction?.();
                  hide();
                }}
                accessibilityRole="button"
                hitSlop={8}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <AppText
                  size={13}
                  weight="700"
                  color={t.bg}
                  style={{ textDecorationLine: 'underline' }}
                >
                  {current.actionLabel}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return React.useContext(ToastContext);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingBottom: space.sm,
  },
  backButton: {
    width: TOUCH,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -space.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  button: {
    minHeight: TOUCH,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  switchRow: {
    minHeight: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});

export { GUTTER, radius, space, TOUCH, useTheme };
export type { ThemeColors };
