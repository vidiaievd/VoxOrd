import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { useModal } from '../../providers/ModalProvider';
import { Button, Icon, Overline, Skeleton, Tag } from '../../components/ui';
import { spacing } from '../../theme/spacing';
import type { Container, DifficultyLevel } from '../../api/types';
import type { SwrResourceState } from '../../hooks/useSwrResource';
import {
  NAMED_LANGUAGES,
  NO_FILTERS,
  defaultFilters,
  filterCatalog,
  filterChoices,
  groupCatalog,
  tagsOf,
  type CatalogFilters,
} from '../../lib/catalog';

/**
 * The filters as the learner left them, kept while the app runs — so Back from a course
 * returns to the same search rather than to the defaults (spec §4.1).
 */
let remembered: CatalogFilters | null = null;

/** A language's name in the UI language, or its code where the strings have none. */
export function useLanguageName(): (code: string) => string {
  const { t } = useTranslation();
  return (code: string) => (NAMED_LANGUAGES.includes(code) ? t(`catalog.lang.${code}`) : code.toUpperCase());
}

interface Props {
  catalog: SwrResourceState<Container[]>;
  /** The course being studied: the chips start on its language and level. */
  current: Container | null;
  enrolledIds: ReadonlySet<string>;
  onOpen: (course: Container) => void;
}

/** The «Catalogue» segment (Courses spec §5.3, mockup 5b). */
export function CatalogList({ catalog, current, enrolledIds, onOpen }: Props) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const modal = useModal();
  const languageName = useLanguageName();

  const [filters, setFiltersState] = useState<CatalogFilters>(() => remembered ?? defaultFilters(current));
  const setFilters = (next: CatalogFilters) => {
    remembered = next;
    setFiltersState(next);
  };

  // The course list may arrive after the segment opened; the chips then take its defaults.
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (remembered || !current) return;
    setFiltersState(defaultFilters(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // The field answers at once; the list follows 300 ms after the last key.
  const [typed, setTyped] = useState(filters.query);
  useEffect(() => {
    if (typed === filters.query) return;
    const timer = setTimeout(() => setFilters({ ...filters, query: typed }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const data = catalog.data;
  const list = useMemo(() => data ?? [], [data]);
  const choices = useMemo(() => filterChoices(list), [list]);
  const groups = useMemo(() => groupCatalog(filterCatalog(list, filters)), [list, filters]);

  const pickLanguage = () =>
    modal.show({
      type: 'picker',
      title: t('catalog.language'),
      options: [
        { value: '', label: t('catalog.allLanguages') },
        ...choices.langs.map(code => ({ value: code, label: languageName(code) })),
      ],
      current: filters.lang ?? '',
      closeLabel: t('common.close'),
      onSelect: (value: string) => setFilters({ ...filters, lang: value || null }),
    });

  const pickLevel = () =>
    modal.show({
      type: 'picker',
      title: t('catalog.level'),
      options: [
        { value: '', label: t('catalog.allLevels') },
        ...choices.levels.map(level => ({ value: level, label: level })),
      ],
      current: filters.level ?? '',
      closeLabel: t('common.close'),
      onSelect: (value: string) => setFilters({ ...filters, level: (value || null) as DifficultyLevel | null }),
    });

  const pickSkill = () =>
    modal.show({
      type: 'picker',
      title: t('catalog.skill'),
      options: [
        { value: '', label: t('catalog.allSkills') },
        ...choices.skills.map(tag => ({ value: tag.id, label: tag.name })),
      ],
      current: filters.skill ?? '',
      closeLabel: t('common.close'),
      onSelect: (value: string) => setFilters({ ...filters, skill: value || null }),
    });
  const skillName = choices.skills.find(tag => tag.id === filters.skill)?.name;

  const reset = () => {
    setTyped('');
    setFilters(NO_FILTERS);
  };

  const chip = (label: string, selected: boolean, onPress: () => void, a11y: string) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${a11y}: ${label}`}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => ({
        height: 32,
        borderRadius: 16,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: selected ? colors.accent700 : colors.neutral700,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={[typography.secondary, { color: selected ? colors.accent200 : colors.neutral300 }]}>{label}</Text>
      <Icon name="CaretDown" size={12} color={selected ? colors.accent200 : colors.neutral300} />
    </Pressable>
  );

  return (
    <View style={{ gap: 14 }}>
      <View
        style={{
          height: 44,
          borderRadius: 8,
          backgroundColor: colors.surface,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Icon name="MagnifyingGlass" size={18} color={colors.neutral500} />
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder={t('catalog.search')}
          placeholderTextColor={colors.neutral500}
          accessibilityLabel={t('catalog.search')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={{ ...typography.body, flex: 1, height: 44, padding: 0, color: colors.text }}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -spacing.screenGutter }}
        contentContainerStyle={{ paddingHorizontal: spacing.screenGutter, gap: 8 }}
      >
        {chip(
          filters.lang ? languageName(filters.lang) : t('catalog.language'),
          !!filters.lang,
          pickLanguage,
          t('catalog.language'),
        )}
        {chip(filters.level ?? t('catalog.level'), !!filters.level, pickLevel, t('catalog.level'))}
        {(choices.skills.length > 0 || filters.skill) &&
          chip(skillName ?? t('catalog.skill'), !!filters.skill, pickSkill, t('catalog.skill'))}
      </ScrollView>

      {catalog.status === 'loading' && (
        <View style={{ gap: 14 }}>
          <Skeleton width={120} height={11} />
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </View>
      )}

      {catalog.status === 'error' && (
        <View style={{ gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
          <Text style={[typography.cardTitleMedium, { color: colors.text }]}>{t('catalog.loadError')}</Text>
          <Text style={[typography.secondary, { color: colors.neutral500 }]}>{catalog.error?.message}</Text>
          <Button variant="secondary" size={44} label={t('catalog.retry')} onPress={catalog.refresh} />
        </View>
      )}

      {catalog.status === 'loaded' && groups.length === 0 && (
        <View style={{ gap: 8, alignItems: 'flex-start' }}>
          <Text style={[typography.body, { color: colors.neutral400 }]}>{t('catalog.empty')}</Text>
          <Button variant="ghost" size={44} label={t('catalog.reset')} onPress={reset} />
        </View>
      )}

      {catalog.status === 'loaded' &&
        groups.map(group => (
          <View key={`${group.lang}|${group.level}`}>
            <View style={{ marginBottom: 4 }}>
              <Overline>{t('catalog.group', { lang: languageName(group.lang), level: group.level })}</Overline>
            </View>
            {group.courses.map((course, i) => {
              const mine = enrolledIds.has(course.id);
              // The skill tags say more than the description does; the description stays the fallback.
              const skills = tagsOf(course, ['skill']).map(tag => tag.name);
              const meta = skills.length > 0 ? skills.join(' · ') : course.description;
              return (
                <Pressable
                  key={course.id}
                  onPress={() => onOpen(course)}
                  accessibilityRole="button"
                  accessibilityLabel={[course.title, course.difficultyLevel, mine ? t('catalog.mine') : null]
                    .filter(Boolean)
                    .join('. ')}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    paddingVertical: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.neutral800,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[typography.cardTitle, { color: colors.text }]} numberOfLines={2}>
                      {course.title}
                    </Text>
                    {meta ? (
                      <Text style={[typography.meta, { color: colors.neutral500 }]} numberOfLines={1}>
                        {meta}
                      </Text>
                    ) : null}
                  </View>
                  {mine && <Tag label={t('catalog.mine')} />}
                  <Tag label={course.difficultyLevel} variant="outline" />
                </Pressable>
              );
            })}
          </View>
        ))}
    </View>
  );
}
