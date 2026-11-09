import React, { useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { useModal } from '../../providers/ModalProvider';
import { spacing } from '../../theme/spacing';
import { useAuth } from '../../hooks/useAuth';
import { useSchoolPage } from '../../hooks/useFindSchool';
import { useSchools } from '../../hooks/useSchools';
import { useMyCourses } from '../../hooks/useMyCourses';
import { useCatalog } from '../../hooks/useCatalog';
import { applyToSchool, isPlaced, type SchoolApplication } from '../../api/schools';
import { ApiError } from '../../api/client';
import { isNetworkError } from '../../api/isNetworkError';
import { filterChoices } from '../../lib/catalog';
import { SELF_REPORTED_LEVELS, applicationState, websiteLabel } from '../../lib/findSchool';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, Icon, NavHeader, Skeleton, Tag, useToast } from '../../components/ui';
import { useLanguageName } from '../CoursesScreen/CatalogList';
import { SchoolAvatar } from '../FindSchoolScreen';

interface SchoolPublicScreenProps {
  slug: string;
  onBack: () => void;
  /** «Мои курсы» — where a school's courses appear once it places the learner. */
  onOpenCourses: () => void;
}

/**
 * A school's public page and the application (plan 04 step 9c), after the web's `/s/:slug`.
 * The application carries what the server takes — the language to study and the learner's own
 * guess at their level, both optional; there is no message field to send. What happens after
 * (approval, onboarding steps, placement) is the school's and the web's; the phone shows where
 * the application stands.
 */
export function SchoolPublicScreen({ slug, onBack, onOpenCourses }: SchoolPublicScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const modal = useModal();
  const { offline } = useAuth();
  const languageName = useLanguageName();
  const { status, data, error, refreshing, stale, refresh } = useSchoolPage(slug);
  const schools = useSchools();
  const myCourses = useMyCourses();
  const catalog = useCatalog();

  // The answer to an application sent from this screen, ahead of the next read of the page.
  const [sent, setSent] = useState<SchoolApplication | null>(null);
  const [busy, setBusy] = useState(false);

  // The languages the platform teaches, as far as the phone knows: the learner's own courses
  // and the catalogue's. The learner's first course's language is the default.
  const ownLangs = myCourses.courses.map(c => c.container.targetLanguage);
  const langs = useMemo(
    () =>
      [...new Set([...ownLangs, ...filterChoices(catalog.data ?? []).langs])]
        .filter(code => /^[a-z]{2}$/.test(code))
        .sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ownLangs.join('|'), catalog.data],
  );
  const [lang, setLang] = useState<string | null | undefined>(undefined);
  const chosenLang = lang === undefined ? (ownLangs.find(code => langs.includes(code)) ?? null) : lang;
  const [level, setLevel] = useState<string | null>(null);

  const school = data?.school;
  const application = sent ?? data?.application ?? null;
  const placed = !!school && (schools.schools ?? []).some(s => s.schoolId === school.schoolId && isPlaced(s));
  const state = school ? applicationState(school, application, placed) : null;

  const pickLanguage = () =>
    modal.show({
      type: 'picker',
      title: t('findSchool.language'),
      options: [
        { value: '', label: t('findSchool.notSaying') },
        ...langs.map(code => ({ value: code, label: languageName(code) })),
      ],
      current: chosenLang ?? '',
      closeLabel: t('common.close'),
      onSelect: (value: string) => setLang(value || null),
    });

  const pickLevel = () =>
    modal.show({
      type: 'picker',
      title: t('findSchool.level'),
      options: [
        { value: '', label: t('findSchool.levelUnknown') },
        ...SELF_REPORTED_LEVELS.map(l => ({ value: l, label: l })),
      ],
      current: level ?? '',
      closeLabel: t('common.close'),
      onSelect: (value: string) => setLevel(value || null),
    });

  const apply = async () => {
    if (!school) return;
    setBusy(true);
    try {
      const result = await applyToSchool(school.schoolId, {
        language: chosenLang ?? undefined,
        selfReportedLevel: level ?? undefined,
      });
      setSent(result);
      toast.show(t('findSchool.sent'));
      // A school that lets everyone in puts the learner on its roster at once.
      schools.refresh().catch(() => {});
    } catch (e) {
      toast.show(
        t(e instanceof ApiError && e.status === 404 ? 'findSchool.applyGone' : 'findSchool.applyFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, value: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: colors.neutral800,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={[typography.body, { flex: 1, color: colors.neutral400 }]}>{label}</Text>
      <Text style={[typography.body, { color: colors.text }]}>{value}</Text>
      <Icon name="CaretDown" size={14} color={colors.neutral500} />
    </Pressable>
  );

  const canApply = state === 'apply' || state === 'reapply';

  const statusLine =
    state === 'pending'
      ? t('findSchool.statePending')
      : state === 'accepted'
        ? t('findSchool.stateAccepted')
        : state === 'member'
          ? t('findSchool.stateMember')
          : state === 'closed'
            ? t('findSchool.stateClosed')
            : state === 'reapply'
              ? t('findSchool.stateRejected')
              : null;

  const footer = !school ? null : canApply ? (
    <View style={{ gap: 8 }}>
      <Button
        block
        size={48}
        label={state === 'reapply' ? t('findSchool.reapply') : t('findSchool.apply')}
        busy={busy}
        disabled={offline}
        onPress={apply}
      />
      <Text style={[typography.meta, { color: colors.neutral500, textAlign: 'center' }]}>
        {offline ? t('findSchool.offlineNote') : t('findSchool.applyNote')}
      </Text>
    </View>
  ) : state === 'member' ? (
    <Button block size={48} label={t('findSchool.openCourses')} onPress={onOpenCourses} />
  ) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <NavHeader parentLabel={t('findSchool.title')} onBack={onBack} />

      <ScrollView
        contentContainerStyle={{ paddingTop: 4, paddingHorizontal: spacing.screenGutter, paddingBottom: 24, gap: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accentBase} />}
      >
        {stale && isNetworkError(error) && <OfflineBanner />}

        {status === 'loading' && (
          <View style={{ gap: 12 }}>
            <Skeleton width={64} height={64} radius={16} />
            <Skeleton width="70%" height={30} />
            <Skeleton height={60} />
          </View>
        )}

        {status === 'error' && (
          <View style={{ gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
            <Text style={[typography.cardTitleMedium, { color: colors.text }]}>{t('findSchool.loadError')}</Text>
            <Text style={[typography.secondary, { color: colors.neutral500 }]}>{error?.message}</Text>
            <Button variant="secondary" size={44} label={t('catalog.retry')} onPress={refresh} />
          </View>
        )}

        {school && (
          <>
            <View style={{ gap: 12 }}>
              <SchoolAvatar school={school} size={64} />
              <Text
                accessibilityRole="header"
                style={{ ...typography.resumeTitle, fontSize: 28, lineHeight: 32, color: colors.text }}
              >
                {school.name}
              </Text>
              {school.description ? (
                <Text style={[typography.body, { lineHeight: 21, color: colors.neutral400 }]}>
                  {school.description}
                </Text>
              ) : null}
              {school.city || school.website ? (
                <View style={{ gap: 6 }}>
                  {school.city ? (
                    <Text style={[typography.secondary, { color: colors.neutral400 }]}>{school.city}</Text>
                  ) : null}
                  {school.website ? (
                    <Pressable
                      onPress={() => Linking.openURL(school.website!).catch(() => {})}
                      accessibilityRole="link"
                      hitSlop={{ top: 8, bottom: 8 }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
                    >
                      <Icon name="GlobeSimple" size={16} color={colors.accent300} />
                      <Text style={[typography.secondary, { color: colors.accent300 }]}>
                        {websiteLabel(school.website)}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>

            {statusLine ? (
              <View style={{ gap: 8 }}>
                {state === 'pending' || state === 'accepted' || state === 'member' ? (
                  <Tag
                    label={
                      state === 'member'
                        ? t('findSchool.mine')
                        : state === 'accepted'
                          ? t('findSchool.tagAccepted')
                          : t('findSchool.tagPending')
                    }
                    variant={state === 'member' ? 'accent' : 'outline'}
                  />
                ) : null}
                <Text style={[typography.body, { color: colors.neutral300 }]}>{statusLine}</Text>
              </View>
            ) : null}

            {canApply && (
              <View>
                <Text style={[typography.cardTitleMedium, { color: colors.text, marginBottom: 4 }]}>
                  {t('findSchool.application')}
                </Text>
                {langs.length > 0 &&
                  field(
                    t('findSchool.language'),
                    chosenLang ? languageName(chosenLang) : t('findSchool.notSaying'),
                    pickLanguage,
                  )}
                {field(t('findSchool.level'), level ?? t('findSchool.levelUnknown'), pickLevel)}
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
