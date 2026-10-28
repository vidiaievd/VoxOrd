import React, { useEffect, useMemo, useRef } from 'react';
import { RefreshControl, SectionList, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, Icon, NavHeader, Overline, Skeleton, Spinner, useToast } from '../../components/ui';
import { isNetworkError } from '../../api/isNetworkError';
import { useCourseHome } from '../../hooks/useCourseHome';
import { useDownloadState } from '../../hooks/useDownloadState';
import { useUnitContents } from '../../hooks/useUnitContents';
import { useRefreshOnForeground } from '../../hooks/useRefreshOnForeground';
import { itemsInOrder, nextInUnit } from '../../lib/nextItem';
import { openContentItem } from '../../lib/openContentItem';
import { ContentItemRow } from './ContentItemRow';
import { firstChangedItem } from './changedItem';
import { groupSections, type SectionKind, type UnitSection } from './groupSections';
import type { UnitContentsItem } from '../../api/types';
import type { Screen } from '../../navigation/screens';

interface UnitContentsScreenProps {
  unitId: string;
  courseId: string;
  onBack: () => void;
  /** Opens a material on the screen `openContentItem` names for it. */
  onOpen: (screen: Screen) => void;
}

/** «64 МБ», «< 1 МБ» — whole megabytes (Courses spec §11). */
function formatSize(bytes: number, t: ReturnType<typeof useTranslation>['t']): string {
  const mb = Math.round(bytes / (1024 * 1024));
  return mb < 1 ? t('unitContents.sizeUnderMb') : t('unitContents.sizeMb', { mb });
}

const isDone = (i: UnitContentsItem) => i.status === 'completed' || i.status === 'submitted';

export function UnitContentsScreen({
  unitId,
  courseId,
  onBack,
  onOpen,
}: UnitContentsScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { status, data, error, refreshing, stale, refresh } = useUnitContents(unitId);
  // The course home gives the unit its number, the next unit and the parent label; it is
  // cached from the screen the learner came through.
  const home = useCourseHome(courseId).data;
  const download = useDownloadState(unitId, courseId, home?.units ?? null);
  const net = useNetInfo();
  useRefreshOnForeground(refresh);
  const listRef = useRef<SectionList<UnitContentsItem, UnitSection>>(null);

  const sections = useMemo(() => (data ? groupSections(data) : []), [data]);
  const items = useMemo(
    () => (data ? itemsInOrder(data).filter(i => i.contentType !== 'container') : []),
    [data],
  );
  const isEmpty = sections.length === 0;

  const units = useMemo(
    () => [...(home?.units ?? [])].sort((a, b) => a.position - b.position),
    [home],
  );
  const unitIndex = units.findIndex(u => u.id === unitId);
  const followingUnit = unitIndex === -1 ? undefined : units.slice(unitIndex + 1).find(u => u.status !== 'locked');
  const next = data ? nextInUnit(data) : null;

  // On return from a text or a set the cached copy shows first; once the fresh one arrives,
  // scroll to the row whose status moved.
  const shownBefore = useRef<UnitContentsItem[] | null>(null);
  useEffect(() => {
    if (!data) return;
    if (stale) {
      shownBefore.current ??= itemsInOrder(data);
      return;
    }
    const before = shownBefore.current;
    shownBefore.current = null;
    if (!before) return;
    const changed = firstChangedItem(before, itemsInOrder(data));
    if (!changed) return;
    for (let s = 0; s < sections.length; s++) {
      const itemIndex = sections[s].data.findIndex(i => i.id === changed.id);
      if (itemIndex !== -1) {
        listRef.current?.scrollToLocation({ sectionIndex: s, itemIndex, viewPosition: 0.3 });
        return;
      }
    }
  }, [data, stale, sections]);

  const open = (item: UnitContentsItem): (() => void) | undefined => {
    const screen = data ? openContentItem(item, data, { unitId, courseId }) : null;
    if (!screen) return undefined;
    // Offline, a material the downloader accounts for and has not fetched cannot open. With no
    // account (after a restart) the material may still be cached, so it is left to try.
    const missing = net.isConnected === false && download.items[item.id] !== undefined && download.items[item.id] !== 'done';
    return missing ? () => toast.show(t('unitContents.itemNotSaved')) : () => onOpen(screen);
  };

  const sectionTitle = (title: string | null, kind: SectionKind | null, count: number) => {
    if (title !== null) return title;
    switch (kind) {
      case 'texts':
        return t('unitContents.secTexts');
      case 'wordsGrammar':
        return t('unitContents.secWordsGrammar');
      case 'exercises':
        return t('unitContents.secExercises', { count });
      default:
        return t('unitContents.otherItems');
    }
  };

  const size = download.sizeBytes === null ? null : formatSize(download.sizeBytes, t);
  const downloadLine = {
    done: {
      icon: 'DeviceMobile',
      label: size ? t('unitContents.savedSize', { size }) : t('unitContents.saved'),
    },
    none: { icon: 'CloudArrowDown', label: t('unitContents.notSaved') },
    downloading: {
      icon: 'CircleNotch',
      label:
        download.progress === null
          ? t('unitContents.saving')
          : t('unitContents.savingPct', { pct: Math.round(download.progress * 100) }),
    },
  }[download.state] as { icon: 'DeviceMobile' | 'CloudArrowDown' | 'CircleNotch'; label: string };

  // A spinner on a material only while the unit is being walked; a failure stays after it.
  const itemDownload = (item: UnitContentsItem): 'fetching' | 'failed' | undefined => {
    const st = download.items[item.id];
    if (st === 'failed') return 'failed';
    if (download.state === 'downloading' && (st === 'queued' || st === 'downloading')) return 'fetching';
    return undefined;
  };

  const onDownloadPress = () => {
    if (download.state === 'done') toast.show(downloadLine.label);
    else if (download.state === 'downloading') toast.show(t('unitContents.saving'));
    else if (!download.inWindow) toast.show(t('unitContents.outsideWindowToast'));
    else download.start();
  };

  const header = (
    <View style={{ paddingTop: 4, paddingBottom: 14, gap: 6 }}>
      <Overline>
        {t('unitContents.header', {
          n: unitIndex === -1 ? '' : unitIndex + 1,
          done: items.filter(isDone).length,
          total: items.length,
        })}
      </Overline>
      <Text style={[typography.h1, { color: colors.text }]}>
        {data?.moduleTitle ?? t('unitContents.title')}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {download.state === 'downloading' ? (
          <Spinner size={14} color={colors.neutral400} />
        ) : (
          <Icon name={downloadLine.icon} size={14} color={colors.neutral400} />
        )}
        <Text style={[typography.meta, { color: colors.neutral400 }]}>{downloadLine.label}</Text>
      </View>
    </View>
  );

  const footer =
    status !== 'loaded' || !data ? null : next ? (
      <Button
        block
        size={48}
        icon="Play"
        label={t('unitContents.continueItem', { item: next.title ?? t('unitContents.untitled') })}
        onPress={open(next)}
      />
    ) : followingUnit ? (
      <Button
        block
        size={48}
        variant="secondary"
        label={t('unitContents.nextUnit', { unit: followingUnit.title })}
        onPress={() => onOpen({ name: 'UnitContents', unitId: followingUnit.id, courseId })}
      />
    ) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <NavHeader
        parentLabel={home?.courseInfo.title ?? t('unitContents.title')}
        onBack={onBack}
        right={{
          icon:
            download.state === 'done'
              ? 'CheckCircle'
              : download.state === 'downloading'
              ? 'CircleNotch'
              : 'DownloadSimple',
          spinning: download.state === 'downloading',
          accessibilityLabel: downloadLine.label,
          onPress: onDownloadPress,
        }}
      />
      {stale && isNetworkError(error) && <OfflineBanner />}

      {status === 'loading' && (
        <View style={{ paddingHorizontal: spacing.screenGutter, gap: 10 }}>
          <Skeleton width={120} height={12} />
          <Skeleton width="70%" height={28} />
          {[0, 1, 2, 3, 4].map(i => (
            <Skeleton key={i} height={52} radius={8} />
          ))}
        </View>
      )}

      {status === 'error' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 }}>
          <Text style={[typography.cardTitleMedium, { color: colors.text, textAlign: 'center' }]}>
            {t('unitContents.loadError')}
          </Text>
          <Text style={[typography.secondary, { color: colors.neutral500, textAlign: 'center' }]}>
            {error?.message}
          </Text>
          <Button variant="secondary" size={44} label={t('courses.retry')} onPress={refresh} />
        </View>
      )}

      {status === 'loaded' && (
        <SectionList
          ref={listRef}
          sections={sections}
          keyExtractor={item => item.id}
          ListHeaderComponent={header}
          ListEmptyComponent={
            isEmpty ? (
              <Text style={[typography.body, { color: colors.neutral500, textAlign: 'center', marginTop: 24 }]}>
                {t('unitContents.noItems')}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 8 }}>
              <ContentItemRow
                item={item}
                onPress={open(item)}
                download={itemDownload(item)}
                onLockedPress={() => toast.show(t('unitContents.lockedToast'))}
              />
            </View>
          )}
          renderSectionHeader={({ section }) => (
            <View style={{ marginTop: 10, marginBottom: 6 }}>
              <Overline>{sectionTitle(section.title, section.kind, section.data.length)}</Overline>
            </View>
          )}
          contentContainerStyle={{ paddingHorizontal: spacing.screenGutter, paddingTop: 4, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accentBase} />
          }
          stickySectionHeadersEnabled={false}
          onScrollToIndexFailed={() => {}}
        />
      )}

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
