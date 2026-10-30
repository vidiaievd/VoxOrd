import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyAiUsage, type AiUsage } from '../../api/assistant';
import { getCourseMastery } from '../../api/mastery';
import { getMyDisplayName } from '../../api/ownProfile';
import {
  getOwnSubscription,
  type OwnSubscription,
} from '../../api/ownSubscription';
import type { CourseMastery } from '../../api/types';
import {
  Button,
  Card,
  Icon,
  Overline,
  ProgressTrack,
  Tag,
} from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useEntitlements } from '../../hooks/useEntitlements';
import { useMyCourses } from '../../hooks/useMyCourses';
import { useSchools } from '../../hooks/useSchools';
import { useSwrResource } from '../../hooks/useSwrResource';
import { useTranslation } from '../../i18n';
import { useTabScrollToTop } from '../../navigation/tabScroll';
import { useTheme } from '../../providers/ThemeProvider';
import type { ColorScheme } from '../../theme/colors';
import type { Typography } from '../../theme/typography';
import { creditsMeter } from '../TodayScreen/blockLogic';
import {
  avatarLetter,
  identityLines,
  schoolRows,
  subscriptionCard,
} from './profileLogic';

interface ProfileScreenProps {
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  onOpenSubscription: () => void;
  onOpenSchool: (schoolId: string) => void;
}

const CREDITS_FEATURE = 'ai.review_direct';

/**
 * The Profile tab's root (Profile §5.2): header with the gear, identity, subscription card,
 * «My schools», progress. Each block loads on its own and is hidden when it has nothing true
 * to say. Left out on purpose: «Join by code» (no API, G4), «Details» on progress (no screen
 * for it on the phone, G8), the week's time (no learner-facing source) and any streak.
 */
export function ProfileScreen({
  onOpenSettings,
  onOpenAccount,
  onOpenSubscription,
  onOpenSchool,
}: ProfileScreenProps) {
  const { t, language } = useTranslation();
  const { colors, typography } = useTheme();
  const styles = makeStyles(colors, typography);
  const scrollRef = useRef<ScrollView>(null);
  useTabScrollToTop('Profile', scrollRef);

  const { status: authStatus, user } = useAuth();
  const userId = authStatus === 'signedIn' && user ? user.id : null;
  const [pulling, setPulling] = useState(false);

  const nameLoader = useCallback(() => getMyDisplayName(), []);
  const name = useSwrResource<string | null>(
    userId ? `profile-name:${userId}` : null,
    nameLoader,
  );

  const subLoader = useCallback(() => getOwnSubscription(), []);
  const sub = useSwrResource<OwnSubscription | null>(
    userId ? `own-subscription:${userId}` : null,
    subLoader,
  );

  const schoolsState = useSchools();
  const { entitlements, refresh: refreshEntitlements } = useEntitlements(
    schoolsState.schools,
    schoolsState.status,
  );
  const hasCredits = entitlements?.features[CREDITS_FEATURE]?.enabled === true;
  const usageLoader = useCallback(() => getMyAiUsage(CREDITS_FEATURE), []);
  const usage = useSwrResource<AiUsage | null>(
    userId && hasCredits ? `ai-usage:${userId}:${CREDITS_FEATURE}` : null,
    usageLoader,
  );

  const { courses, refresh: refreshCourses } = useMyCourses();
  const course = courses[0]?.container ?? null;
  const masteryLoader = useCallback(
    () => getCourseMastery(course!.id),
    [course],
  );
  const mastery = useSwrResource<CourseMastery>(
    userId && course ? `mastery:${userId}:${course.id}` : null,
    masteryLoader,
  );

  const refresh = useCallback(async () => {
    setPulling(true);
    try {
      await Promise.all([
        name.refresh(),
        sub.refresh(),
        schoolsState.refresh(),
        refreshEntitlements(),
        usage.refresh(),
        refreshCourses(),
        mastery.refresh(),
      ]);
    } finally {
      setPulling(false);
    }
  }, [
    name,
    sub,
    schoolsState,
    refreshEntitlements,
    usage,
    refreshCourses,
    mastery,
  ]);

  const formatDate = useCallback(
    (iso: string) => {
      try {
        return new Date(iso).toLocaleDateString(language, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      } catch {
        return iso.slice(0, 10);
      }
    },
    [language],
  );

  const email = user?.email ?? null;
  const identity = identityLines(name.data ?? null, email, t);
  const card = sub.data ? subscriptionCard(sub.data, t, formatDate) : null;
  const meter = creditsMeter(hasCredits ? usage.data ?? null : null);
  const rows = useMemo(
    () => schoolRows(schoolsState.schools, t),
    [schoolsState.schools, t],
  );
  const skills = mastery.data?.bySkill ?? [];
  const showProgress = !!course && skills.some(s => s.masteryPercent > 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={refresh}
            tintColor={colors.accentBase}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {t('nav.profile')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.title')}
            onPress={onOpenSettings}
            style={styles.gear}
          >
            {({ pressed }) => (
              <Icon
                name="GearSix"
                size={23}
                color={pressed ? colors.accent300 : colors.neutral400}
              />
            )}
          </Pressable>
        </View>

        {identity.title ? (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenAccount}
            style={({ pressed }) => [
              styles.identity,
              pressed && { backgroundColor: colors.neutral900 },
            ]}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarLetter}>
                {avatarLetter(name.data ?? null, email)}
              </Text>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={1}>
                {identity.title}
              </Text>
              <Text style={styles.metaLine} numberOfLines={1}>
                {identity.meta}
              </Text>
            </View>
            <Icon name="CaretRight" size={16} color={colors.neutral600} />
          </Pressable>
        ) : null}

        {card ? (
          <Card variant={card.lit ? 'lit' : 'plain'} style={styles.subCard}>
            <View style={styles.subTop}>
              <Overline
                style={card.lit ? { color: colors.accent300 } : undefined}
              >
                {t('profile.sub.kicker')}
              </Overline>
              {card.tag ? <Tag label={card.tag} variant="accent" /> : null}
            </View>
            <View style={{ gap: 3 }}>
              <Text style={styles.planTitle}>{card.title}</Text>
              {card.meta ? (
                <Text style={styles.planMeta}>{card.meta}</Text>
              ) : null}
            </View>
            {meter ? (
              <View style={{ gap: 6 }}>
                <View style={styles.creditsRow}>
                  <Text style={styles.creditsLabel}>
                    {t('profile.sub.credits')}
                  </Text>
                  <Text style={styles.creditsLabel}>
                    {`${Math.round(meter.used * 10) / 10} / ${
                      Math.round(meter.total * 10) / 10
                    }`}
                  </Text>
                </View>
                <ProgressTrack value={meter.fill} />
              </View>
            ) : null}
            <Button
              variant="secondary"
              size={40}
              label={
                card.lit ? t('profile.sub.manage') : t('profile.sub.details')
              }
              onPress={onOpenSubscription}
              style={{ alignSelf: 'flex-start' }}
            />
          </Card>
        ) : null}

        {rows.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Overline style={{ paddingHorizontal: 2 }}>
              {t('profile.schools')}
            </Overline>
            <Card padding={0}>
              {rows.map((row, i) => (
                <Pressable
                  key={row.schoolId}
                  accessibilityRole="button"
                  onPress={() => onOpenSchool(row.schoolId)}
                  style={[styles.schoolRow, i > 0 && styles.schoolDivider]}
                >
                  <View style={styles.logo}>
                    <Text style={styles.logoLetter}>
                      {avatarLetter(row.name, null)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={styles.schoolName} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text style={styles.schoolMeta} numberOfLines={1}>
                      {row.meta}
                    </Text>
                  </View>
                  <Icon name="CaretRight" size={16} color={colors.neutral600} />
                </Pressable>
              ))}
            </Card>
          </View>
        ) : null}

        {showProgress && course ? (
          <Card style={{ gap: 10 }}>
            <Text style={styles.progressTitle} numberOfLines={1}>
              {t('profile.progress', { course: course.title })}
            </Text>
            <View style={styles.skillGrid}>
              {skills.map(s => (
                <View key={s.skill} style={styles.skill}>
                  <Text style={styles.skillLabel} numberOfLines={1}>
                    {t(`profile.skills.${s.skill as 'vocabulary'}`)}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <ProgressTrack
                      value={s.masteryPercent / 100}
                      fill={colors.accent600}
                    />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme, typography: Typography) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    scroll: {
      paddingTop: 10,
      paddingHorizontal: 18,
      paddingBottom: 24,
      gap: 14,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: { ...typography.h1, color: colors.text },
    // Optical alignment with the gutter (Profile §5.2).
    gear: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: -8,
    },
    identity: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 4,
      borderRadius: 8,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.neutral800,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLetter: { fontSize: 21, fontWeight: '500', color: colors.text },
    identityText: { flex: 1, gap: 2 },
    name: { fontSize: 18, fontWeight: '500', color: colors.text },
    metaLine: { ...typography.meta, fontSize: 13, color: colors.neutral500 },
    subCard: { gap: 12 },
    subTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    planTitle: { fontSize: 18, fontWeight: '500', color: colors.text },
    planMeta: { fontSize: 13, color: colors.neutral400 },
    creditsRow: { flexDirection: 'row', justifyContent: 'space-between' },
    creditsLabel: { ...typography.meta, color: colors.neutral400 },
    schoolRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    schoolDivider: { borderTopWidth: 1, borderTopColor: colors.neutral800 },
    logo: {
      width: 36,
      height: 36,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.neutral700,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoLetter: { fontSize: 14, fontWeight: '500', color: colors.text },
    schoolName: { ...typography.body, color: colors.text },
    schoolMeta: { ...typography.meta, color: colors.neutral500 },
    progressTitle: { fontSize: 15, color: colors.text },
    skillGrid: { gap: 10 },
    skill: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    skillLabel: { ...typography.meta, color: colors.neutral400, width: 104 },
  });
