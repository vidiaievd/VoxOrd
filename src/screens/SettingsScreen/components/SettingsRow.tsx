import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';

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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f7',
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
    color: '#1a1a2e',
    fontWeight: '500',
  },
  selectRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectValue: {
    fontSize: 14,
    color: '#888',
    marginRight: 4,
  },
  chevron: {
    fontSize: 20,
    color: '#ccc',
  },
  badge: {
    backgroundColor: '#6c63ff',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },
});
