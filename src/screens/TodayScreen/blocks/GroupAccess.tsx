import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { StudentSchool } from '../../../api/schools';
import { Icon } from '../../../components/ui';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { dismissNotice, getDismissedNotices } from '../../../store/groupNoticeStore';
import { getOpenedCourseIds } from '../../../store/lastCourseStore';
import { groupNotices } from '../blockLogic';

interface GroupAccessProps {
  schools: readonly StudentSchool[] | null;
  onOpenCourse: (courseId: string) => void;
}

/**
 * Block 3 (the web's `GroupAccessNotice`): a group opened a course the learner has not
 * opened yet. One line per school; ✕ hides it for that membership for good.
 */
export function GroupAccess({ schools, onOpenCourse }: GroupAccessProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const [known, setKnown] = useState<{ opened: Set<string>; dismissed: Set<string> } | null>(null);

  const membershipIds = useMemo(() => (schools ?? []).map((s) => s.membershipId), [schools]);
  useEffect(() => {
    let live = true;
    Promise.all([getOpenedCourseIds(), getDismissedNotices(membershipIds)]).then(
      ([opened, dismissed]) => live && setKnown({ opened, dismissed }),
    );
    return () => {
      live = false;
    };
  }, [membershipIds]);

  // Until both are read, say nothing rather than flash a notice that is about to go.
  if (!known) return null;
  const notices = groupNotices(schools, known.opened, known.dismissed);
  if (notices.length === 0) return null;

  const hide = (membershipId: string) => {
    void dismissNotice(membershipId);
    setKnown((k) => (k ? { ...k, dismissed: new Set(k.dismissed).add(membershipId) } : k));
  };

  return (
    <View style={{ gap: 8 }}>
      {notices.map((n) => {
        const message = n.courseName
          ? t('today.groupAccess', { group: n.groupName, school: n.schoolName, course: n.courseName })
          : t('today.groupAccessNoCourse', { group: n.groupName, school: n.schoolName });
        return (
          <View
            key={n.membershipId}
            style={{
              padding: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.neutral700,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <Icon name="GraduationCap" size={18} color={colors.accent300} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[typography.secondary, { color: colors.text }]}>{message}</Text>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${t('today.openCourse')}: ${n.courseName ?? ''}`}
                onPress={() => onOpenCourse(n.courseId)}
                style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
              >
                <Text style={[typography.secondary, { color: colors.accent300 }]}>
                  {t('today.openCourse')}
                </Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('today.dismiss')}
              onPress={() => hide(n.membershipId)}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -12, marginRight: -12 }}
            >
              <Icon name="XCircle" size={18} color={colors.neutral500} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
