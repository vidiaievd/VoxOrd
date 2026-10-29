import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NotificationItem } from '../../api/notifications';
import { Icon } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import type { ColorScheme } from '../../theme/colors';
import { formatNotificationTime } from '../../utils/formatNotificationTime';
import { describeNotification } from './describe';

interface Props {
  item: NotificationItem;
  /** Read once per render pass of the list, so every row agrees on «now». */
  now: Date;
  onPress: (item: NotificationItem) => void;
}

/** One notification (Notifications §4.4): avatar icon, title and time, two lines of body. */
export const NotificationRow = React.memo(function NotificationRow({
  item,
  now,
  onPress,
}: Props) {
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { icon, title, body } = describeNotification(item, t);
  const time = formatNotificationTime(item.createdAt, now, language);
  const opens = item.target.kind !== 'none';
  const label = [
    item.read ? null : t('notifications.unreadLabel'),
    [title, body, time].filter(Boolean).join('. '),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole={opens ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityHint={opens ? t('notifications.openWork') : undefined}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.avatar}>
        <Icon name={icon} size={18} color={colors.neutral300} />
        {!item.read && <View style={styles.dot} />}
      </View>
      <View style={styles.column}>
        <View style={styles.head}>
          <Text
            numberOfLines={2}
            style={[
              styles.title,
              { color: item.read ? colors.neutral300 : colors.text },
            ]}
          >
            {title}
          </Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        {body ? (
          <Text numberOfLines={2} ellipsizeMode="tail" style={styles.body}>
            {body}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.neutral800,
    },
    // The highlight runs to the screen's edges, past the list's 18 px padding.
    pressed: {
      backgroundColor: colors.neutral900,
      marginHorizontal: -18,
      paddingHorizontal: 18,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.neutral900,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
    dot: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accentBase,
    },
    column: { flex: 1, minWidth: 0, gap: 3 },
    head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    title: { flex: 1, fontSize: 14, lineHeight: 18 },
    time: {
      fontSize: 11,
      color: colors.neutral500,
      flexShrink: 0,
    },
    body: { fontSize: 13, lineHeight: 18, color: colors.neutral400 },
  });
