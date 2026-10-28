import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { CourseInfo, UnitContentsResult, UnitSummary } from '../../../api/types';
import { Button, Card, Icon, ProgressTrack } from '../../../components/ui';
import { useCourseHome } from '../../../hooks/useCourseHome';
import { useUnitContents } from '../../../hooks/useUnitContents';
import { useTranslation } from '../../../i18n';
import { readCacheSnapshot } from '../../../lib/swrCache';
import { unitContentsResource } from '../../../lib/courseResources';
import type { Screen } from '../../../navigation/screens';
import { useTheme } from '../../../providers/ThemeProvider';
import { setLastCourseId } from '../../../store/lastCourseStore';
import { useRegisterRefresh } from '../refresh';
import { resolveResume, type ItemMeta, type ResumeItem } from '../nextItem';
import { nextUnit } from '../today';
import { resumeTarget } from '../resumeTarget';
import { ResumeSkeleton } from './Skeleton';

interface ResumeProps {
  courseId: string;
  offline: boolean;
  onNavigate: (screen: Screen) => void;
}

/** «Norwegian · A2»; the language code is shown as is when the runtime cannot name it. */
function languageAndLevel(info: CourseInfo): string {
  let language = info.targetLanguage;
  try {
    const names = new Intl.DisplayNames([], { type: 'language' });
    language = names.of(info.targetLanguage) ?? language;
  } catch {
    // Not every runtime names languages; the code is still true.
  }
  return [language, info.cefrLevel].filter(Boolean).join(' · ');
}

/** Block 4: the one main action — carry on from where the learner stopped. */
export function Resume({ courseId, offline, onNavigate }: ResumeProps) {
  const home = useCourseHome(courseId);
  useRegisterRefresh(home.refresh);

  const unit = home.data ? nextUnit(home.data.units) : null;
  if (!home.data || !unit) {
    // A course that failed to load with nothing cached has nothing to continue.
    return home.status === 'loading' ? <ResumeSkeleton /> : null;
  }
  return (
    <ResumeCard
      courseId={courseId}
      info={home.data.courseInfo}
      units={home.data.units}
      unit={unit}
      offline={offline}
      onNavigate={onNavigate}
    />
  );
}

interface ResumeCardProps extends ResumeProps {
  info: CourseInfo;
  units: UnitSummary[];
  unit: UnitSummary;
}

function ResumeCard({ courseId, info, units, unit, offline, onNavigate }: ResumeCardProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const contents = useUnitContents(unit.id);
  useRegisterRefresh(contents.refresh);

  // A unit whose contents were stored — by the download or by opening it — is on the phone.
  const [onPhone, setOnPhone] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let live = true;
    readCacheSnapshot<UnitContentsResult>(unitContentsResource(unit.id).key).then((snap) => {
      if (live && snap) setOnPhone(new Set([unit.id]));
    });
    return () => {
      live = false;
    };
  }, [unit.id, contents.data]);

  const resume = useMemo(
    () =>
      resolveResume({
        units,
        unitContents: contents.data ? { [unit.id]: contents.data } : {},
        downloadedUnitIds: onPhone,
        offline,
      }),
    [units, unit.id, contents.data, onPhone, offline],
  );

  if (!resume) return null;
  if (contents.status === 'loading' && !contents.data) return <ResumeSkeleton />;

  const target = resumeTarget(resume, courseId, contents.data);
  const go = (screen: Screen) => {
    void setLastCourseId(courseId);
    onNavigate(screen);
  };

  const done = resume.kind === 'courseDone';
  const next = resume.kind === 'item' ? resume.next : null;
  const title = done
    ? t('today.courseDone')
    : (next?.item.title ?? resume.unit.title);
  const meta = done ? t('today.courseDoneHint') : next ? metaText(next.meta, t) : null;
  const heldUntilOnline = next?.meta.availability === 'needsNetwork';
  const progress =
    resume.kind === 'item'
      ? { title: resume.unit.title, done: resume.done, total: resume.total }
      : null;

  return (
    <Card variant="lit" padding={18} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Text style={[typography.overline, { color: colors.accent300 }]}>
          {t('today.continue')}
        </Text>
        <Text style={[typography.meta, { color: colors.neutral400, flexShrink: 1 }]} numberOfLines={1}>
          {languageAndLevel(info)}
        </Text>
      </View>

      <Text
        accessibilityRole="header"
        numberOfLines={2}
        style={[typography.resumeTitle, { color: colors.text }]}
      >
        {title}
      </Text>

      {meta ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {next?.meta.availability === 'onPhone' ? (
            <Icon name="DeviceMobile" size={14} color={colors.neutral400} />
          ) : null}
          {heldUntilOnline ? <Icon name="CloudSlash" size={14} color={colors.neutral400} /> : null}
          <Text style={[typography.secondary, { color: colors.neutral400, flexShrink: 1 }]}>
            {meta}
          </Text>
        </View>
      ) : null}

      {progress ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text
              numberOfLines={1}
              style={[typography.meta, { color: colors.neutral400, flexShrink: 1 }]}
            >
              {progress.title}
            </Text>
            <Text style={[typography.meta, { color: colors.neutral400 }]}>
              {progress.done}/{progress.total}
            </Text>
          </View>
          <ProgressTrack value={progress.total > 0 ? progress.done / progress.total : 0} />
        </View>
      ) : null}

      <Button
        block
        icon={done ? undefined : 'Play'}
        label={done ? t('today.courseDoneCta') : t('today.continueCta')}
        accessibilityLabel={t('today.continueA11y', {
          title,
          meta: meta ?? '',
        })}
        onPress={() => go(target)}
      />
      {heldUntilOnline ? (
        <Text style={[typography.meta, { color: colors.neutral500 }]}>
          {t('today.unlockOnline')}
        </Text>
      ) : null}

      {resume.kind === 'item' && resume.upcoming.length > 0 ? (
        <View style={{ gap: 2 }}>
          <Text style={[typography.overline, { color: colors.neutral500 }]}>
            {t('today.nextInUnit')}
          </Text>
          {resume.upcoming.map((u) => (
            <UpcomingRow key={u.item.id} entry={u} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

type T = (path: string, vars?: Record<string, string | number>) => string;

/** «Exercise · 5 min» — what the step is and how long it takes. */
function metaText(meta: ItemMeta, t: T): string {
  const parts = [t(`itemType.${meta.type}`)];
  if (meta.minutes !== null && meta.minutes > 0) {
    parts.push(t('today.minutes', { min: meta.minutes }));
  }
  if (meta.availability === 'onPhone') parts.push(t('today.onPhone'));
  if (meta.availability === 'needsNetwork') parts.push(t('today.needsNetwork'));
  return parts.join(' · ');
}

function UpcomingRow({ entry }: { entry: ResumeItem }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { item, meta } = entry;
  return (
    <View
      style={{
        minHeight: 36,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <Text
        numberOfLines={1}
        style={[typography.secondary, { color: colors.neutral300, flex: 1 }]}
      >
        {item.title ?? t(`itemType.${meta.type}`)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {meta.availability === 'onPhone' ? (
          <Icon name="DeviceMobile" size={12} color={colors.neutral500} />
        ) : null}
        {meta.availability === 'needsNetwork' ? (
          <Icon name="CloudSlash" size={12} color={colors.neutral500} />
        ) : null}
        <Text style={[typography.meta, { color: colors.neutral500 }]}>
          {t(`itemType.${meta.type}`)}
          {meta.minutes ? ` · ${t('today.minutes', { min: meta.minutes })}` : ''}
        </Text>
      </View>
    </View>
  );
}
