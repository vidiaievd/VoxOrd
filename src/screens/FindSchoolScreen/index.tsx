import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { usePublicSchools } from '../../hooks/useFindSchool';
import { useSchools } from '../../hooks/useSchools';
import { isNetworkError } from '../../api/isNetworkError';
import { isPlaced, type PublicSchool } from '../../api/schools';
import { filterSchools, initials } from '../../lib/findSchool';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, Icon, NavHeader, Skeleton, Tag } from '../../components/ui';

/** The query as the learner left it, kept while the app runs — Back from a school keeps the search. */
let rememberedQuery = '';

interface FindSchoolScreenProps {
  /** The label of the screen Back leads to. */
  parentLabel: string;
  onBack: () => void;
  onOpen: (school: PublicSchool) => void;
}

/** A school's avatar, or its initials on a quiet disc. */
export function SchoolAvatar({ school, size }: { school: PublicSchool; size: number }) {
  const { colors, typography } = useTheme();
  const [failed, setFailed] = useState(false);
  const radius = size / 4;
  if (school.avatarUrl && !failed) {
    return (
      <Image
        source={{ uri: school.avatarUrl }}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.neutral800 }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: colors.neutral800,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={[typography.secondary, { color: colors.neutral300, fontSize: size * 0.36 }]}>
        {initials(school.name)}
      </Text>
    </View>
  );
}

/**
 * «Find a school» (plan 04 step 9c): every school with a public page, searched by name,
 * description and city as on the web's `/discover`. Schools carry no languages, levels or
 * courses, so there are no chips — only the search.
 */
export function FindSchoolScreen({ parentLabel, onBack, onOpen }: FindSchoolScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { status, data, error, refreshing, stale, refresh } = usePublicSchools();
  const { schools: mine } = useSchools();

  const [typed, setTyped] = useState(rememberedQuery);
  const [query, setQuery] = useState(rememberedQuery);
  useEffect(() => {
    if (typed === query) return;
    const timer = setTimeout(() => {
      rememberedQuery = typed;
      setQuery(typed);
    }, 300);
    return () => clearTimeout(timer);
  }, [typed, query]);

  const shown = useMemo(() => filterSchools(data ?? [], query), [data, query]);
  // «My school» means placed in a group there — the same rule the school's page and Today use.
  const mineIds = useMemo(() => new Set((mine ?? []).filter(isPlaced).map(s => s.schoolId)), [mine]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <NavHeader parentLabel={parentLabel} onBack={onBack} />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 4, paddingHorizontal: spacing.screenGutter, paddingBottom: 24, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accentBase} />}
      >
        <View style={{ gap: 6 }}>
          <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
            {t('findSchool.title')}
          </Text>
          <Text style={[typography.body, { color: colors.neutral400 }]}>{t('findSchool.intro')}</Text>
        </View>

        {stale && isNetworkError(error) && <OfflineBanner />}

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
            placeholder={t('findSchool.search')}
            placeholderTextColor={colors.neutral500}
            accessibilityLabel={t('findSchool.search')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{ ...typography.body, flex: 1, height: 44, padding: 0, color: colors.text }}
          />
        </View>

        {status === 'loading' && (
          <View style={{ gap: 14 }}>
            <Skeleton height={52} />
            <Skeleton height={52} />
            <Skeleton height={52} />
          </View>
        )}

        {status === 'error' && (
          <View style={{ gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
            <Text style={[typography.cardTitleMedium, { color: colors.text }]}>{t('findSchool.loadError')}</Text>
            <Text style={[typography.secondary, { color: colors.neutral500 }]}>{error?.message}</Text>
            <Button variant="secondary" size={44} label={t('catalog.retry')} onPress={refresh} />
          </View>
        )}

        {status === 'loaded' && shown.length === 0 && (
          <View style={{ gap: 8, alignItems: 'flex-start' }}>
            <Text style={[typography.body, { color: colors.neutral400 }]}>
              {query.trim() ? t('findSchool.empty') : t('findSchool.none')}
            </Text>
            {query.trim() ? (
              <Button
                variant="ghost"
                size={44}
                label={t('findSchool.clear')}
                onPress={() => {
                  setTyped('');
                  setQuery('');
                  rememberedQuery = '';
                }}
              />
            ) : null}
          </View>
        )}

        {status === 'loaded' && shown.length > 0 && (
          <View>
            {shown.map((school, i) => {
              const isMine = mineIds.has(school.schoolId);
              const meta = [school.city, school.description].filter(Boolean).join(' · ');
              return (
                <Pressable
                  key={school.schoolId}
                  onPress={() => onOpen(school)}
                  accessibilityRole="button"
                  accessibilityLabel={[school.name, school.city, isMine ? t('findSchool.mine') : null]
                    .filter(Boolean)
                    .join('. ')}
                  style={({ pressed }) => ({
                    minHeight: 64,
                    paddingVertical: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.neutral800,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <SchoolAvatar school={school} size={40} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[typography.cardTitle, { color: colors.text }]} numberOfLines={1}>
                      {school.name}
                    </Text>
                    {meta ? (
                      <Text style={[typography.meta, { color: colors.neutral500 }]} numberOfLines={1}>
                        {meta}
                      </Text>
                    ) : null}
                  </View>
                  {isMine ? (
                    <Tag label={t('findSchool.mine')} />
                  ) : school.isOpenForApplications ? (
                    <Tag label={t('findSchool.open')} variant="outline" />
                  ) : null}
                  <Icon name="CaretRight" size={16} color={colors.neutral500} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
