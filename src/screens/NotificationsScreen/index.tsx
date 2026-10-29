import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  NotificationFilter,
  NotificationItem,
} from '../../api/notifications';
import { Button, Icon, Skeleton } from '../../components/ui';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useNotifications } from '../../hooks/useNotifications';
import { useTranslation } from '../../i18n';
import { openNotification } from '../../navigation/openNotification';
import type { Screen } from '../../navigation/screens';
import { useTabScrollToTop } from '../../navigation/tabScroll';
import { useTheme } from '../../providers/ThemeProvider';
import { notificationsStore } from '../../store/notificationsStore';
import type { ColorScheme } from '../../theme/colors';
import type { Typography } from '../../theme/typography';
import { NotificationRow } from './NotificationRow';

/** A feed older than this is fetched again when the screen opens (Notifications §5.5). */
const STALE_MS = 60_000;

/**
 * Where the list was left, per learner. The navigator remounts the screen on every arrival, so
 * Back from a submission would otherwise land at the top; the segment already lives in the store.
 */
const savedOffset = { userId: null as string | null, y: 0 };

interface Props {
  onNavigate: (screen: Screen) => void;
}

/** The Notifications tab (Notifications §4, §7): the learner's feed, newest first. */
export function NotificationsScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const styles = makeStyles(colors, typography);
  const feed = useNotifications();
  const listRef = useRef<FlatList<NotificationItem>>(null);
  useTabScrollToTop('Notifications', listRef);
  const [now, setNow] = useState(() => new Date());
  const [pulling, setPulling] = useState(false);

  useEffect(() => {
    setNow(new Date());
    notificationsStore
      .hydrate()
      .then(() => notificationsStore.refreshIfStale(STALE_MS))
      .catch(() => undefined);
  }, []);

  // The times are read against «now»; a wake-up moves it, no timer needed. The navigator's
  // `useKeepUnreadFresh` refetches the feed on the same wake-up.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') setNow(new Date());
    });
    return () => sub.remove();
  }, []);

  // «Mark all read» follows the whole feed, not the segment: the badge's own number.
  const unread = feed.unreadCount;
  const hasItems = !feed.feedEmpty;
  const showSkeleton =
    !hasItems && (feed.status === 'loading' || feed.status === 'idle');
  const showError = !hasItems && feed.status === 'error';

  const onRefresh = useCallback(async () => {
    setPulling(true);
    try {
      await feed.refresh();
    } finally {
      setPulling(false);
    }
  }, [feed]);

  const onPressRow = useCallback(
    (item: NotificationItem) => {
      if (!item.read) feed.markRead(item.id).catch(() => undefined);
      openNotification(item, onNavigate);
    },
    [feed, onNavigate],
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    savedOffset.userId = feed.userId;
    savedOffset.y = e.nativeEvent.contentOffset.y;
  };

  const restored = useRef(false);
  const restoreScroll = () => {
    if (restored.current || !hasItems) return;
    restored.current = true;
    if (savedOffset.userId === feed.userId && savedOffset.y > 0)
      listRef.current?.scrollToOffset({
        offset: savedOffset.y,
        animated: false,
      });
  };

  const emptyText = (filter: NotificationFilter) =>
    filter === 'work'
      ? t('notifications.emptyWork')
      : t('notifications.emptyCourse');

  const header = (
    <View>
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          {t('notifications.title')}
        </Text>
        <Pressable
          onPress={() => feed.markAllRead().catch(() => undefined)}
          disabled={unread === 0}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}
          accessibilityRole="button"
          style={unread === 0 ? styles.disabled : undefined}
        >
          {({ pressed }) => (
            <Text
              style={[
                styles.readAll,
                { color: pressed ? colors.accent400 : colors.accent300 },
              ]}
            >
              {t('notifications.readAll')}
            </Text>
          )}
        </Pressable>
      </View>
      {feed.offline && hasItems && (
        <View style={styles.offline}>
          <Icon name="CloudSlash" size={13} color={colors.neutral500} />
          <Text style={styles.offlineText}>{t('notifications.offline')}</Text>
        </View>
      )}
      <View style={styles.segment}>
        <SegmentedControl
          value={feed.filter}
          onChange={feed.setFilter}
          options={[
            { value: 'all', label: t('notifications.filter.all') },
            { value: 'work', label: t('notifications.filter.work') },
            { value: 'course', label: t('notifications.filter.course') },
          ]}
        />
      </View>
    </View>
  );

  const footer = (() => {
    if (!hasItems) return null;
    if (feed.pageStatus === 'loading')
      return (
        <View style={styles.pageSlot}>
          <ActivityIndicator size="small" color={colors.neutral500} />
        </View>
      );
    if (feed.pageStatus === 'error')
      return (
        <Pressable
          onPress={() => feed.loadMore().catch(() => undefined)}
          style={styles.pageSlot}
          accessibilityRole="button"
        >
          <Text style={styles.loadMore}>{t('notifications.loadMore')}</Text>
        </Pressable>
      );
    if (feed.hasMore || feed.items.length === 0) return null;
    return (
      <Text style={styles.footer}>
        {t('notifications.footer')}
        <Text
          style={styles.footerLink}
          accessibilityRole="link"
          suppressHighlighting
          onPress={() => onNavigate({ name: 'Settings' })}
        >
          {t('notifications.footerLink')}
        </Text>
      </Text>
    );
  })();

  const empty = (() => {
    if (showSkeleton)
      return (
        <View>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={36} height={36} radius={18} />
              <View style={styles.skeletonText}>
                <Skeleton width="70%" height={12} radius={4} />
                <Skeleton width="90%" height={12} radius={4} />
              </View>
            </View>
          ))}
        </View>
      );
    if (showError)
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('notifications.loadError')}</Text>
          <Button
            label={t('notifications.retry')}
            variant="secondary"
            size={40}
            style={styles.retry}
            onPress={() => feed.refresh()}
          />
        </View>
      );
    if (feed.feedEmpty)
      return (
        <View style={styles.empty}>
          <Icon name="Bell" size={28} color={colors.neutral600} />
          <Text style={[styles.emptyTitle, styles.emptyGap]}>
            {t('notifications.empty')}
          </Text>
          <Text style={styles.emptyBody}>{t('notifications.emptyBody')}</Text>
        </View>
      );
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{t('notifications.emptyFilter')}</Text>
        <Text style={styles.emptyBody}>{emptyText(feed.filter)}</Text>
      </View>
    );
  })();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        ref={listRef}
        data={feed.items}
        keyExtractor={n => n.id}
        renderItem={({ item }) => (
          <NotificationRow item={item} now={now} onPress={onPressRow} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        ListFooterComponentStyle={styles.footerSlot}
        contentContainerStyle={styles.content}
        onEndReached={() => {
          if (feed.hasMore && feed.pageStatus === 'idle')
            feed.loadMore().catch(() => undefined);
        }}
        onEndReachedThreshold={0.5}
        onScroll={onScroll}
        scrollEventThrottle={64}
        onContentSizeChange={restoreScroll}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={onRefresh}
            enabled={!feed.offline}
            tintColor={colors.accentBase}
            colors={[colors.accentBase]}
            progressBackgroundColor={colors.surface}
          />
        }
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme, typography: Typography) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { paddingTop: 14, paddingHorizontal: 18, paddingBottom: 24 },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    title: { ...typography.h1, color: colors.text },
    readAll: { fontSize: 13 },
    disabled: { opacity: 0.45 },
    segment: { marginBottom: 14 },
    offline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
    },
    offlineText: { fontSize: 12, color: colors.neutral500 },
    skeletonRow: {
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.neutral800,
    },
    skeletonText: { flex: 1, gap: 8, justifyContent: 'center' },
    empty: { paddingTop: 34, alignItems: 'flex-start' },
    emptyGap: { marginTop: 12 },
    emptyTitle: { ...typography.cardTitleMedium, color: colors.text },
    emptyBody: {
      ...typography.secondary,
      lineHeight: 18,
      color: colors.neutral400,
      marginTop: 4,
    },
    retry: { alignSelf: 'flex-start', marginTop: 12 },
    footerSlot: { marginTop: 14 },
    footer: { fontSize: 12, lineHeight: 18, color: colors.neutral500 },
    footerLink: { color: colors.accent300 },
    pageSlot: { height: 44, alignItems: 'center', justifyContent: 'center' },
    loadMore: { fontSize: 13, color: colors.accent300 },
  });
