import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';
import { Icon, IconName } from './Icon';
import { Toggle } from './Toggle';

export interface SegmentOption {
  value: string;
  label: string;
  icon?: IconName;
}

interface BaseProps {
  icon: IconName;
  label: string;
  sub?: string;
  /** No divider above the first row of a group. */
  isFirst?: boolean;
}

export type SettingsRowProps = BaseProps &
  (
    | { type: 'navigate'; value?: string; onPress: () => void }
    | { type: 'value'; value: string }
    | {
        type: 'toggle';
        value: boolean;
        onChange: (value: boolean) => void;
        disabled?: boolean;
      }
    | { type: 'radio'; checked: boolean; onPress: () => void }
    | { type: 'check' }
    | {
        type: 'segmented';
        options: SegmentOption[];
        value: string;
        onChange: (value: string) => void;
      }
  );

export function SettingsRow(props: SettingsRowProps) {
  const { icon, label, sub, isFirst } = props;
  const { colors, typography } = useTheme();

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        minHeight: 50,
      }}
    >
      <Icon name={icon} size={19} color={colors.neutral400} />
      <View style={{ flex: 1 }}>
        <Text style={[typography.body, { color: colors.text }]}>{label}</Text>
        {sub ? (
          <Text style={[typography.meta, { color: colors.neutral500 }]}>
            {sub}
          </Text>
        ) : null}
      </View>
      {props.type === 'navigate' || props.type === 'value' ? (
        <>
          {props.value ? (
            <Text
              numberOfLines={1}
              style={[
                typography.secondary,
                { color: colors.neutral400, flexShrink: 0, maxWidth: '45%' },
              ]}
            >
              {props.value}
            </Text>
          ) : null}
          {props.type === 'navigate' ? (
            <Icon name="CaretRight" size={16} color={colors.neutral600} />
          ) : null}
        </>
      ) : null}
      {props.type === 'toggle' ? (
        <Toggle
          value={props.value}
          onChange={props.onChange}
          disabled={props.disabled}
          accessibilityLabel={label}
        />
      ) : null}
      {props.type === 'radio' && props.checked ? (
        <Icon name="Check" size={19} color={colors.accentBase} />
      ) : null}
    </View>
  );

  const body = (() => {
    switch (props.type) {
      case 'navigate':
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={props.onPress}
            style={({ pressed }) =>
              pressed ? { backgroundColor: colors.neutral900 } : null
            }
          >
            {content}
          </Pressable>
        );
      case 'radio':
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: props.checked }}
            onPress={props.onPress}
            style={({ pressed }) =>
              pressed ? { backgroundColor: colors.neutral900 } : null
            }
          >
            {content}
          </Pressable>
        );
      case 'toggle':
        // The whole row flips the value, not just the switch.
        return (
          <Pressable
            accessible={false}
            disabled={props.disabled}
            onPress={() => props.onChange(!props.value)}
          >
            {content}
          </Pressable>
        );
      case 'segmented':
        return (
          <View>
            {content}
            <View
              accessibilityRole="tablist"
              style={{
                flexDirection: 'row',
                gap: 4,
                marginHorizontal: 14,
                marginBottom: 12,
                padding: 3,
                borderRadius: radii.plate,
                backgroundColor: colors.neutral900,
              }}
            >
              {props.options.map(o => {
                const active = o.value === props.value;
                const fg = active ? colors.text : colors.neutral400;
                return (
                  <Pressable
                    key={o.value}
                    accessibilityRole="tab"
                    accessibilityLabel={o.label}
                    accessibilityState={{ selected: active }}
                    onPress={() => props.onChange(o.value)}
                    style={{
                      flex: 1,
                      height: 34,
                      borderRadius: radii.segmentOption,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      backgroundColor: active
                        ? colors.accent800
                        : 'transparent',
                    }}
                  >
                    {o.icon ? (
                      <Icon name={o.icon} size={15} color={fg} />
                    ) : null}
                    <Text
                      numberOfLines={1}
                      style={[typography.secondary, { color: fg }]}
                    >
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      default:
        return content;
    }
  })();

  return (
    <View
      style={
        isFirst
          ? undefined
          : { borderTopWidth: 1, borderTopColor: colors.neutral800 }
      }
    >
      {body}
    </View>
  );
}
