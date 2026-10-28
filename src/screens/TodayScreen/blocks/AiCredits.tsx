import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { getMyAiUsage, type AiUsage } from '../../../api/assistant';
import { Icon } from '../../../components/ui';
import { useAuth } from '../../../hooks/useAuth';
import { useSwrResource } from '../../../hooks/useSwrResource';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { creditsMeter } from '../blockLogic';
import { useRegisterRefresh } from '../refresh';

interface AiCreditsProps {
  /** «How to get more» — Profile until its subscription screen (plan 07) exists. */
  onMore: () => void;
}

const FEATURE = 'ai.review_direct';
const TRACK_WIDTH = 80;

/** «3,4» — a tenth at most; a credit is a model's cost, so whole numbers would read as zero. */
function credits(value: number, language: string): string {
  try {
    return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  } catch {
    return String(Math.round(value * 10) / 10);
  }
}

function until(iso: string, language: string): string {
  try {
    return new Date(iso).toLocaleDateString(language, { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

/**
 * Block D3 (D): the period's AI-review credits — a line, not a card. Hidden while unmetered,
 * unknown or refused (`getMyAiUsage` turns a 4xx into null). The period is the
 * subscription's, not the calendar month, so the line names its end rather than a month.
 */
export function AiCredits({ onMore }: AiCreditsProps) {
  const { t, language } = useTranslation();
  const { colors, typography } = useTheme();
  const { status: authStatus, user } = useAuth();
  const userId = authStatus === 'signedIn' && user ? user.id : null;
  const loader = useCallback(() => getMyAiUsage(FEATURE), []);
  const { data, refresh } = useSwrResource<AiUsage | null>(
    userId ? `ai-usage:${userId}:${FEATURE}` : null,
    loader,
  );
  useRegisterRefresh(refresh);

  const meter = creditsMeter(data ?? null);
  if (!data || !meter) return null;

  const end = until(data.periodEnd, language);
  const line = t('today.aiCredits.line', {
    used: credits(meter.used, language),
    total: credits(meter.total, language),
  });

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="Lightning" size={12} color={colors.neutral500} />
        <Text style={[typography.meta, { color: colors.neutral500, flexShrink: 1 }]}>
          {end ? `${line} · ${t('today.aiCredits.until', { date: end })}` : line}
        </Text>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: TRACK_WIDTH, height: 3, borderRadius: 2, backgroundColor: colors.neutral800 }}
        >
          <View
            style={{
              width: TRACK_WIDTH * meter.fill,
              height: 3,
              borderRadius: 2,
              backgroundColor: meter.low ? colors.accentBase : colors.neutral500,
            }}
          />
        </View>
      </View>
      <Pressable
        accessibilityRole="link"
        hitSlop={{ top: 8, bottom: 8 }}
        onPress={onMore}
        style={{ alignSelf: 'flex-start' }}
      >
        <Text style={[typography.meta, { color: colors.accent300 }]}>{t('today.aiCredits.more')}</Text>
      </Pressable>
    </View>
  );
}
