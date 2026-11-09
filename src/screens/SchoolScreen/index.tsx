import React, { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { leaveGroup } from '../../api/account';
import {
  Button,
  SettingsGroup,
  SettingsRow,
  SubScreen,
  SubScreenHero,
} from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useNextClass } from '../../hooks/useNextClass';
import { useSchools } from '../../hooks/useSchools';
import { useTranslation } from '../../i18n';
import { useModal } from '../../providers/ModalProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { classLabel, schoolCourses } from './schoolLogic';

interface SchoolScreenProps {
  schoolId: string;
  groupId?: string;
  onBack: () => void;
  onOpenCourse: (courseId: string) => void;
  /** After the learner left the group — back to Profile. */
  onLeft: () => void;
}

/**
 * One school the learner studies in (Profile §7.3): the group, its next class, the courses it
 * opens, what the school sees, and leaving the group. Left out: the «show my words to the
 * teacher» toggle (no backend, G5), course percentages and «Write to the school» (the learner's
 * school record carries no contact).
 */
export function SchoolScreen({
  schoolId,
  groupId,
  onBack,
  onOpenCourse,
  onLeft,
}: SchoolScreenProps) {
  const { t, language } = useTranslation();
  const { colors, typography } = useTheme();
  const { user } = useAuth();
  const { show } = useModal();
  const { schools, refresh } = useSchools();
  const school = schools?.find(s => s.schoolId === schoolId) ?? null;
  const group =
    school?.groups.find(g => g.groupId === groupId) ?? school?.groups[0] ?? null;
  const { nextClass } = useNextClass(school ? [school] : null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const leave = useCallback(async () => {
    if (!user || !school || !group) return;
    setBusy(true);
    setFailed(false);
    try {
      await leaveGroup(school.schoolId, group.groupId, user.id);
      await refresh();
      onLeft();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }, [user, school, group, refresh, onLeft]);

  if (!school || !group) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.bg }}
        edges={['top']}
      >
        <SubScreen
          backLabel={t('nav.profile')}
          onBack={onBack}
          title={t('school.kicker')}
        >
          <Text style={[typography.secondary, { color: colors.neutral400 }]}>
            {schools ? t('school.notFound') : ''}
          </Text>
        </SubScreen>
      </SafeAreaView>
    );
  }

  const courses = schoolCourses(group);
  const groupName = group.groupName ?? '';
  const teachers = group.teachers.map(x => x.name).join(', ');
  const next =
    nextClass && nextClass.groupId === group.groupId
      ? classLabel(nextClass, language)
      : null;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={['top']}
    >
      <SubScreen
        backLabel={t('nav.profile')}
        onBack={onBack}
        title={school.schoolName}
        hero={
          <SubScreenHero
            overline={t('school.kicker')}
            title={t('school.group', { group: groupName })}
            meta={teachers || undefined}
          />
        }
        footer={
          <>
            <Button
              block
              size={48}
              variant="ghost"
              label={t('school.leave')}
              busy={busy}
              onPress={() =>
                show({
                  type: 'confirm',
                  title: t('school.leaveTitle', { group: groupName }),
                  message: t('school.leaveBody'),
                  confirmLabel: t('school.leave'),
                  cancelLabel: t('common.cancel'),
                  onConfirm: () => {
                    void leave();
                  },
                })
              }
            />
            {failed ? (
              <Text
                style={[
                  typography.secondary,
                  { color: colors.danger, textAlign: 'center' },
                ]}
              >
                {t('school.leaveFailed')}
              </Text>
            ) : null}
          </>
        }
      >
        {next ? (
          <SettingsGroup title={t('school.classes')}>
            <SettingsRow
              isFirst
              type="value"
              icon="CalendarBlank"
              label={next.when}
              sub={next.room ?? undefined}
              value=""
            />
          </SettingsGroup>
        ) : null}
        {courses.length > 0 ? (
          <SettingsGroup title={t('school.courses')}>
            {courses.map((c, i) => (
              <SettingsRow
                key={c.courseId}
                isFirst={i === 0}
                type="navigate"
                icon="GraduationCap"
                label={c.title}
                onPress={() => onOpenCourse(c.courseId)}
              />
            ))}
          </SettingsGroup>
        ) : null}
        <SettingsGroup title={t('school.sees')}>
          <SettingsRow
            isFirst
            type="check"
            icon="ChartBar"
            label={t('school.seesProgress')}
          />
          <SettingsRow
            type="check"
            icon="ClipboardText"
            label={t('school.seesWork')}
          />
        </SettingsGroup>
      </SubScreen>
    </SafeAreaView>
  );
}
