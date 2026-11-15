import React, {useCallback, useState} from 'react';
import {ToastAndroid, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {settingsStorage} from '../../../lib/storage';
import {securityService, type LockTimeout} from '../../../services/security';
import {useM3Colors} from '../../../theme/M3PaletteContext';
import MaterialDialogSurface from '../../../components/ui/MaterialDialogSurface';
import SettingsRow from '../../../components/ui/SettingsRow';
import SettingsSwitchRow from '../../../components/ui/SettingsSwitchRow';
import AppText from '../../../components/ui/Text';
import {TVFocusable} from '../../../components/tv';

const TIMEOUT_CHOICES: {value: LockTimeout; label: string; description: string}[] = [
  {
    value: 'immediately',
    label: 'Immediately',
    description: 'Lock as soon as app is minimized or backgrounded.',
  },
  {
    value: '1min',
    label: '1 minute',
    description: 'Lock after 1 minute of inactivity in the background.',
  },
  {
    value: '5min',
    label: '5 minutes',
    description: 'Lock after 5 minutes of inactivity in the background.',
  },
];

export const PrivacyPreference: React.FC = () => {
  const colors = useM3Colors();
  const [biometricsEnabled, setBiometricsEnabled] = useState<boolean>(() =>
    settingsStorage.isBiometricLockEnabled(),
  );
  const [timeout, setTimeoutValue] = useState<LockTimeout>(() =>
    settingsStorage.getBiometricLockTimeout(),
  );
  const [maskInRecents, setMaskInRecents] = useState<boolean>(() =>
    settingsStorage.isMaskInRecentsEnabled(),
  );
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  useFocusEffect(
    useCallback(() => {
      setBiometricsEnabled(settingsStorage.isBiometricLockEnabled());
      setTimeoutValue(settingsStorage.getBiometricLockTimeout());
      setMaskInRecents(settingsStorage.isMaskInRecentsEnabled());
    }, []),
  );

  const handleToggleBiometrics = useCallback(async (next: boolean) => {
    if (next) {
      const {hasHardware, isEnrolled} =
        await securityService.checkBiometricsAvailable();
      if (!hasHardware && !isEnrolled) {
        ToastAndroid.show(
          'No biometric hardware or device PIN lock found on this device',
          ToastAndroid.LONG,
        );
      }
      // Confirm user identity before enabling
      const success = await securityService.promptUnlock(
        'Verify identity to enable App Lock',
      );
      if (success) {
        settingsStorage.setBiometricLockEnabled(true);
        setBiometricsEnabled(true);
        ToastAndroid.show('Biometric App Lock enabled', ToastAndroid.SHORT);
      } else {
        ToastAndroid.show('Authentication failed or canceled', ToastAndroid.SHORT);
      }
    } else {
      // Confirm user identity before disabling
      const success = await securityService.promptUnlock(
        'Verify identity to disable App Lock',
      );
      if (success) {
        settingsStorage.setBiometricLockEnabled(false);
        setBiometricsEnabled(false);
        ToastAndroid.show('Biometric App Lock disabled', ToastAndroid.SHORT);
      } else {
        ToastAndroid.show('Authentication failed or canceled', ToastAndroid.SHORT);
      }
    }
  }, []);

  const handleToggleMaskInRecents = useCallback(async (next: boolean) => {
    setMaskInRecents(next);
    await securityService.setMaskInRecents(next);
    ToastAndroid.show(
      next
        ? 'App Switcher masking enabled (FLAG_SECURE ON)'
        : 'App Switcher masking disabled',
      ToastAndroid.SHORT,
    );
  }, []);

  const currentTimeoutLabel =
    TIMEOUT_CHOICES.find(c => c.value === timeout)?.label || 'Immediately';

  return (
    <>
      {/* Biometric App Lock Toggle */}
      <SettingsSwitchRow
        title="Lock with Biometrics / Screen Lock"
        description="Require Fingerprint, Face Unlock, or PIN on resume"
        value={biometricsEnabled}
        onValueChange={handleToggleBiometrics}
        divider={biometricsEnabled}
      />

      {/* Lock Timeout selector (when enabled) */}
      {biometricsEnabled && (
        <SettingsRow
          title="Lock Timeout"
          description={`Lock app: ${currentTimeoutLabel}`}
          icon="timer-sand"
          onPress={() => setDialogOpen(true)}
          divider={true}
        />
      )}

      {/* App Switcher / Recent Apps Privacy Mask */}
      <SettingsSwitchRow
        title="Mask in Recent Apps"
        description="Hide preview in App Switcher & block reading screenshots"
        value={maskInRecents}
        onValueChange={handleToggleMaskInRecents}
        divider={false}
      />

      {/* Timeout Dialog */}
      {dialogOpen && (
        <MaterialDialogSurface visible onDismiss={() => setDialogOpen(false)}>
          <AppText
            role="titleLarge"
            style={{color: colors.onSurface, marginBottom: 16}}>
            Lock Timeout
          </AppText>
          <View style={{gap: 8}}>
            {TIMEOUT_CHOICES.map(choice => (
              <TVFocusable
                key={choice.value}
                registerScreenFocus={false}
                hasTVPreferredFocus={timeout === choice.value}
                accessibilityRole="radio"
                accessibilityLabel={choice.label}
                accessibilityState={{checked: timeout === choice.value}}
                borderRadius={12}
                onPress={() => {
                  settingsStorage.setBiometricLockTimeout(choice.value);
                  setTimeoutValue(choice.value);
                  setDialogOpen(false);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor:
                    timeout === choice.value
                      ? colors.secondaryContainer
                      : colors.surfaceContainerHighest,
                }}>
                <MaterialIcons
                  name={
                    timeout === choice.value
                      ? 'radio-button-checked'
                      : 'radio-button-unchecked'
                  }
                  size={24}
                  color={colors.primary}
                />
                <View style={{flex: 1}}>
                  <AppText
                    role="bodyLarge"
                    style={{color: colors.onSurface}}>
                    {choice.label}
                  </AppText>
                  <AppText
                    role="bodySmall"
                    style={{
                      color: colors.onSurfaceVariant,
                      marginTop: 4,
                    }}>
                    {choice.description}
                  </AppText>
                </View>
              </TVFocusable>
            ))}
          </View>
        </MaterialDialogSurface>
      )}
    </>
  );
};

export default PrivacyPreference;
