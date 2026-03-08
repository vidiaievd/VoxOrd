import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';

interface BaseProps {
  icon: string;
  label: string;
  isLast?: boolean;
}

interface ToggleProps extends BaseProps {
  type: 'toggle';
  value: boolean;
  onChange: (value: boolean) => void;
}

interface SelectProps extends BaseProps {
  type: 'select';
  value: string;
  onPress: () => void;
}

interface NavigateProps extends BaseProps {
  type: 'navigate';
  onPress: () => void;
  badge?: string;
}

type SettingsRowProps = ToggleProps | SelectProps | NavigateProps;

export function SettingsRow(props: SettingsRowProps) {
  const { icon, label, isLast } = props;

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const renderRight = () => {
    switch (props.type) {
      case 'toggle':
        return (
          <Switch
            value={props.value}
            onValueChange={props.onChange}
            trackColor={{ true: '#6c63ff' }}
          />
        );
      case 'select':
        return (
          <View style={styles.selectRight}>
            <Text style={styles.selectValue}>{props.value}</Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        );
      case 'navigate':
        return (
          <View style={styles.selectRight}>
            {props.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{props.badge}</Text>
              </View>
            )}
            <Text style={styles.chevron}>›</Text>
          </View>
        );
    }
  };

  const handlePress = () => {
    if (props.type === 'select' || props.type === 'navigate') {
      props.onPress();
    }
  };

  return (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      onPress={handlePress}
      activeOpacity={props.type === 'toggle' ? 1 : 0.7}
    >
      <View style={styles.left}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
      {renderRight()}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    left: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    icon: {
      fontSize: 20,
      marginRight: 12,
    },
    label: {
      fontSize: 15,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    selectRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    selectValue: {
      fontSize: 14,
      color: colors.textMuted,
      marginRight: 4,
    },
    chevron: {
      fontSize: 20,
      color: colors.textMuted,
    },
    badge: {
      backgroundColor: colors.accentLight,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginRight: 6,
    },
    badgeText: {
      fontSize: 11,
      color: colors.accent,
      fontWeight: '700',
    },
  });
