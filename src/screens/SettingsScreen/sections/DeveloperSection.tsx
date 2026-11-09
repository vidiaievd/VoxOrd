import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';
import { SettingsGroup } from '../../../components/ui';
import { apiSettingsStore } from '../../../store/apiSettingsStore';
import { useApiSettings } from '../../../hooks/useApiSettings';
import { UiKitScreen } from '../UiKitScreen';
import { TodayDataScreen } from '../TodayDataScreen';

const SAVED_INDICATOR_MS = 1500;

/**
 * Lets the developer point the app at a different gateway (e.g. a physical
 * device instead of the emulator's 10.0.2.2 alias). No modal infra exists for
 * free-text input yet (ModalProvider only supports picker/confirm), so this
 * is a plain inline row rather than reusing the picker sheet.
 */
export function DeveloperSection() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const apiSettings = useApiSettings();

  const [value, setValue] = useState(apiSettings.baseUrl);
  const [justSaved, setJustSaved] = useState(false);
  const [uiKitOpen, setUiKitOpen] = useState(false);
  const [todayDataOpen, setTodayDataOpen] = useState(false);

  // Keep the field in sync if the stored value changes elsewhere.
  useEffect(() => {
    setValue(apiSettings.baseUrl);
  }, [apiSettings.baseUrl]);

  useEffect(() => {
    if (!justSaved) return;
    const id = setTimeout(() => setJustSaved(false), SAVED_INDICATOR_MS);
    return () => clearTimeout(id);
  }, [justSaved]);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && trimmed !== apiSettings.baseUrl;

  async function handleSave() {
    if (!canSave) return;
    await apiSettingsStore.set('baseUrl', trimmed);
    setJustSaved(true);
  }

  return (
    <SettingsGroup title={t('settings.developer')}>
      <View style={styles.row}>
        <Text style={styles.label}>{t('settings.apiBaseUrl')}</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://10.0.2.2:80"
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.8}
          >
            <Text style={styles.saveButtonText}>
              {justSaved ? t('settings.apiBaseUrlSaved') : t('settings.apiBaseUrlSave')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {__DEV__ ? (
        <View style={styles.row}>
          {/* Dev-only, English on purpose: redesign UI kit (plan 01, step 3). */}
          <TouchableOpacity onPress={() => setUiKitOpen(true)} activeOpacity={0.8}>
            <Text style={styles.label}>UI kit (Nocturne primitives)</Text>
          </TouchableOpacity>
          <Modal visible={uiKitOpen} animationType="slide" onRequestClose={() => setUiKitOpen(false)}>
            <UiKitScreen onClose={() => setUiKitOpen(false)} />
          </Modal>
          {/* Dev-only: Today's data ports, read live (plan 02, step 2). */}
          <TouchableOpacity onPress={() => setTodayDataOpen(true)} activeOpacity={0.8}>
            <Text style={styles.label}>Today data (schools, next class, entitlements)</Text>
          </TouchableOpacity>
          <Modal visible={todayDataOpen} animationType="slide" onRequestClose={() => setTodayDataOpen(false)}>
            <TodayDataScreen onClose={() => setTodayDataOpen(false)} />
          </Modal>
        </View>
      ) : null}
    </SettingsGroup>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    row: {
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    label: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 8,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    input: {
      flex: 1,
      backgroundColor: colors.backgroundInput,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 8,
    },
    saveButton: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    saveButtonDisabled: {
      opacity: 0.4,
    },
    saveButtonText: {
      color: colors.textInverted,
      fontSize: 13,
      fontWeight: '700',
    },
  });
