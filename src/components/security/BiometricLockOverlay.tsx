import React, {useEffect, useState} from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {securityService} from '../../services/security';
import AppText from '../ui/Text';

export const BiometricLockOverlay: React.FC = () => {
  const [locked, setLocked] = useState<boolean>(() => securityService.isLocked());

  useEffect(() => {
    return securityService.subscribe(setLocked);
  }, []);

  if (!locked) {
    return null;
  }

  const handleUnlockPress = () => {
    securityService.promptUnlock().catch(() => {});
  };

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons
            name="shield-lock-outline"
            size={56}
            color="#7C4DFF"
          />
        </View>

        <AppText
          role="headlineSmall"
          style={styles.title}>
          Vega Komix is Locked
        </AppText>

        <AppText
          role="bodyMedium"
          style={styles.subtitle}>
          Authenticate with Fingerprint, Face Unlock, or Device PIN to continue reading
        </AppText>

        <TouchableOpacity
          style={styles.unlockButton}
          activeOpacity={0.8}
          onPress={handleUnlockPress}>
          <MaterialCommunityIcons
            name="fingerprint"
            size={22}
            color="#FFFFFF"
          />
          <AppText
            role="labelLargeEmphasized"
            style={styles.buttonText}>
            Unlock App
          </AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 999999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    maxWidth: 400,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(124, 77, 255, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(124, 77, 255, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C4DFF',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 24,
    gap: 8,
    shadowColor: '#7C4DFF',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

export default BiometricLockOverlay;
