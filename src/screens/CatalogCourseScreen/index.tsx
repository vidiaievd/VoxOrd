import React, { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { useAuth } from '../../hooks/useAuth';
import { useCatalogCourse } from '../../hooks/useCatalog';
import { useMyCourses } from '../../hooks/useMyCourses';
import { enrollInCourse } from '../../api/catalog';
import { ApiError } from '../../api/client';
import { isNetworkError } from '../../api/isNetworkError';
import { courseDownloader } from '../../services/courseDownload';
import { catalogAccess, tagsOf } from '../../lib/catalog';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, Icon, NavHeader, Skeleton, Tag, useToast } from '../../components/ui';
import { useLanguageName } from '../CoursesScreen/CatalogList';

/** Units shown before «All {n} units» (mockup 5c). */
const PROGRAMME_PREVIEW = 4;

interface CatalogCourseScreenProps {
  containerId: string;
  onBack: () => void;
  /** Enrolled, or already held: the course opens as the learner's own. */
  onOpenCourse: (courseId: string) => void;
}

/**
 * A catalogue course before enrolment (Courses spec 5c). The course's tags sit under its
 * description and each unit's goals are its line in the programme (plan 04 step 9b). What the
 * mockup shows beyond that — hours, «texts with narration», the share button and the «Pro»
 * note — has no data behind it and is left out (plan 04 step 9).
 */
export function CatalogCourseScreen({ containerId, onBack, onOpenCourse }: CatalogCourseScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { offline } = useAuth();
  const languageName = useLanguageName();
  const { status, data, error, refreshing, stale, refresh } = useCatalogCourse(containerId);
  const myCourses = useMyCourses();
  const [allUnits, setAllUnits] = useState(false);
  const [busy, setBusy] = useState(false);

  const held = myCourses.courses.some(c => c.container.id === containerId);
  const access = catalogAccess(data?.container.accessTier);

  const enrol = async () => {
    setBusy(true);
    try {
      await enrollInCourse(containerId);
    } catch (e) {
      // 409: held already (enrolled from another device) — the course is theirs either way.
      if (!(e instanceof ApiError && e.status === 409)) {
        setBusy(false);
        toast.show(
          t(e instanceof ApiError && e.status === 403 ? 'catalog.enrollForbidden' : 'catalog.enrollFailed'),
        );
        return;
      }
    }
    // The course list must hold the course before its home asks whether it may be left.
    await myCourses.refresh().catch(() => {});
    courseDownloader.run(false, containerId).catch(() => {});
    onOpenCourse(containerId);
  };

  const container = data?.container;
  const units = data?.units ?? [];
  const shownUnits = allUnits ? units : units.slice(0, PROGRAMME_PREVIEW);
  const goals = container?.learningGoals?.filter(g => g.trim()) ?? [];
  // Skills first, then topics and situations; level/other tags repeat the course's own fields.
  const tags = container
    ? [...tagsOf(container, ['skill']), ...tagsOf(container, ['topic', 'situation'])]
    : [];

  const footer = !container ? null : held ? (
    <Button block size={48} label={t('catalog.openCourse')} onPress={() => onOpenCourse(containerId)} />
  ) : access === 'enrol' ? (
    <View style={{ gap: 8 }}>
      <Button block size={48} label={t('catalog.enroll')} busy={busy} disabled={offline} onPress={enrol} />
      <Text style={[typography.meta, { color: colors.neutral500, textAlign: 'center' }]}>
        {offline ? t('catalog.offlineNote') : t('catalog.enrollNote')}
      </Text>
    </View>
  ) : (
    <Text style={[typography.secondary, { color: colors.neutral400, textAlign: 'center' }]}>
      {t(access === 'paid' ? 'catalog.paidNote' : 'catalog.schoolNote')}
    </Text>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <NavHeader parentLabel={t('coursesTab.catalog')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={{ paddingTop: 4, paddingHorizontal: spacing.screenGutter, paddingBottom: 24, gap: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accentBase} />
        }
      >
        {stale && isNetworkError(error) && <OfflineBanner />}

        {status === 'loading' && (
          <View style={{ gap: 12 }}>
            <Skeleton width={110} height={20} />
            <Skeleton width="80%" height={30} />
            <Skeleton height={60} />
            <Skeleton height={120} radius={14} />
          </View>
        )}

        {status === 'error' && (
          <View style={{ gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
            <Text style={[typography.cardTitleMedium, { color: colors.text }]}>{t('catalog.loadError')}</Text>
            <Text style={[typography.secondary, { color: colors.neutral500 }]}>{error?.message}</Text>
            <Button variant="secondary" size={44} label={t('catalog.retry')} onPress={refresh} />
          </View>
        )}

        {container && (
          <>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Tag label={container.difficultyLevel} variant="accent" />
                <Tag label={languageName(container.targetLanguage)} />
              </View>
              <Text
                accessibilityRole="header"
                style={{ ...typography.resumeTitle, fontSize: 28, lineHeight: 32, color: colors.text }}
              >
                {container.title}
              </Text>
              {container.description ? (
                <Text style={[typography.body, { lineHeight: 21, color: colors.neutral400 }]}>
                  {container.description}
                </Text>
              ) : null}
              {tags.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {tags.map(tag => (
                    <Tag key={tag.id} label={tag.name} variant={tag.category === 'skill' ? 'outline' : 'neutral'} />
                  ))}
                </View>
              )}
              {units.length > 0 && (
                <Text style={[typography.meta, { color: colors.neutral500 }]}>
                  {t('catalog.units', { count: units.length })}
                </Text>
              )}
            </View>

            {goals.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text style={[typography.cardTitleMedium, { color: colors.text }]}>{t('catalog.learn')}</Text>
                {goals.map((goal, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ marginTop: 2 }}>
                      <Icon name="Check" size={16} color={colors.accent300} />
                    </View>
                    <Text style={[typography.body, { flex: 1, color: colors.neutral300 }]}>{goal}</Text>
                  </View>
                ))}
              </View>
            )}

            {units.length > 0 && (
              <View style={{ gap: 12 }}>
                <Text style={[typography.cardTitleMedium, { color: colors.text }]}>{t('catalog.program')}</Text>
                {shownUnits.map((unit, i) => {
                  // The unit's goals are its subtitle (mockup 5c's per-unit line).
                  const subtitle = unit.learningGoals?.filter(g => g.trim()).join(' · ');
                  return (
                    <View key={unit.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: colors.neutral800,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={[typography.meta, { color: colors.neutral300 }]}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[typography.body, { color: colors.text }]} numberOfLines={2}>
                          {unit.title ?? t('catalog.unitN', { n: i + 1 })}
                        </Text>
                        {subtitle ? (
                          <Text style={[typography.meta, { color: colors.neutral500 }]} numberOfLines={2}>
                            {subtitle}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
                {units.length > PROGRAMME_PREVIEW && (
                  <View style={{ alignItems: 'flex-start' }}>
                    <Button
                      variant="ghost"
                      size={44}
                      label={allUnits ? t('catalog.fewerUnits') : t('catalog.allUnits', { count: units.length })}
                      onPress={() => setAllUnits(v => !v)}
                    />
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {footer && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.neutral800,
            paddingTop: 12,
            paddingHorizontal: spacing.screenGutter,
            paddingBottom: 12 + insets.bottom,
          }}
        >
          {footer}
        </View>
      )}
    </SafeAreaView>
  );
}
