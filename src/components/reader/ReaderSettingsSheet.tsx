import React, {useCallback, useMemo, useRef} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from '../ui/Text';
import type {
  ImageScale,
  ReaderSettings,
  ReaderTheme,
} from './types';
import {THEME_COLORS} from './types';

interface ReaderSettingsSheetProps {
  visible: boolean;
  settings: ReaderSettings;
  onUpdateSettings: (newSettings: Partial<ReaderSettings>) => void;
  onClose: () => void;
}

const THEME_OPTIONS: Array<{
  theme: ReaderTheme;
  label: string;
  bgColor: string;
  textColor: string;
}> = [
  {
    theme: 'amoled',
    label: 'AMOLED',
    bgColor: '#000000',
    textColor: '#FFFFFF',
  },
  {
    theme: 'dark',
    label: 'Dark Gray',
    bgColor: '#18181B',
    textColor: '#F4F4F5',
  },
  {
    theme: 'sepia',
    label: 'Sepia',
    bgColor: '#F4ECD8',
    textColor: '#433422',
  },
  {
    theme: 'white',
    label: 'White',
    bgColor: '#FFFFFF',
    textColor: '#111827',
  },
];

const SCALE_OPTIONS: Array<{
  scale: ImageScale;
  label: string;
  icon: string;
}> = [
  {scale: 'fit_width', label: 'Fit Width', icon: 'arrow-expand-horizontal'},
  {scale: 'fit_height', label: 'Fit Height', icon: 'arrow-expand-vertical'},
  {scale: 'original', label: 'Original', icon: 'aspect-ratio'},
];

export const ReaderSettingsSheet: React.FC<ReaderSettingsSheetProps> = ({
  visible,
  settings,
  onUpdateSettings,
  onClose,
}) => {
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['65%', '85%'], []);
  const themeColors = THEME_COLORS[settings.theme];

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    ),
    [],
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={{flex: 1}}
          onPress={e => e.stopPropagation()}>
          <BottomSheet
            ref={sheetRef}
            snapPoints={snapPoints}
            enablePanDownToClose
            backdropComponent={renderBackdrop}
            onClose={onClose}
            backgroundStyle={{backgroundColor: '#1E1E24'}}
            handleIndicatorStyle={{backgroundColor: '#71717A'}}>
            <BottomSheetScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.headerRow}>
                <AppText role="titleLargeEmphasized" style={{color: '#FFFFFF'}}>
                  Reader Settings
                </AppText>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <MaterialCommunityIcons name="close" size={20} color="#A1A1AA" />
                </TouchableOpacity>
              </View>

              {/* 1. Theme Palette Selector */}
              <View style={styles.section}>
                <AppText role="labelLargeEmphasized" style={styles.sectionLabel}>
                  Background Theme
                </AppText>
                <View style={styles.themeOptionsGrid}>
                  {THEME_OPTIONS.map(opt => {
                    const isSelected = settings.theme === opt.theme;
                    return (
                      <TouchableOpacity
                        key={opt.theme}
                        onPress={() => onUpdateSettings({theme: opt.theme})}
                        style={[
                          styles.themeCard,
                          {
                            backgroundColor: opt.bgColor,
                            borderColor: isSelected ? '#7C4DFF' : '#3F3F46',
                            borderWidth: isSelected ? 2.5 : 1,
                          },
                        ]}>
                        <AppText
                          role="labelSmallEmphasized"
                          style={{
                            color: opt.textColor,
                            fontSize: 12,
                          }}>
                          {opt.label}
                        </AppText>
                        {isSelected && (
                          <MaterialCommunityIcons
                            name="check-circle"
                            size={16}
                            color="#7C4DFF"
                            style={styles.selectedIcon}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* 2. Image Scale Mode */}
              <View style={styles.section}>
                <AppText role="labelLargeEmphasized" style={styles.sectionLabel}>
                  Image Scaling
                </AppText>
                <View style={styles.scaleOptionsRow}>
                  {SCALE_OPTIONS.map(opt => {
                    const isSelected = settings.imageScale === opt.scale;
                    return (
                      <TouchableOpacity
                        key={opt.scale}
                        onPress={() => onUpdateSettings({imageScale: opt.scale})}
                        style={[
                          styles.scaleCard,
                          isSelected && styles.scaleCardActive,
                        ]}>
                        <MaterialCommunityIcons
                          name={opt.icon as any}
                          size={20}
                          color={isSelected ? '#FFFFFF' : '#A1A1AA'}
                        />
                        <AppText
                          role="labelMediumEmphasized"
                          style={{
                            color: isSelected ? '#FFFFFF' : '#A1A1AA',
                            marginTop: 4,
                          }}>
                          {opt.label}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* 3. Toggles Section */}
              <View style={styles.section}>
                <AppText role="labelLargeEmphasized" style={styles.sectionLabel}>
                  Preferences & Controls
                </AppText>

                {/* Auto-Crop White Borders */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTextContainer}>
                    <AppText role="titleSmall" style={{color: '#FFFFFF'}}>
                      Auto-Crop White Borders
                    </AppText>
                    <AppText role="bodySmall" style={{color: '#A1A1AA'}}>
                      Crops empty white margins around scanned pages
                    </AppText>
                  </View>
                  <Switch
                    value={settings.cropWhiteBorders}
                    onValueChange={cropWhiteBorders =>
                      onUpdateSettings({cropWhiteBorders})
                    }
                    thumbColor={settings.cropWhiteBorders ? '#7C4DFF' : '#71717A'}
                    trackColor={{false: '#3F3F46', true: 'rgba(124, 77, 255, 0.4)'}}
                  />
                </View>

                {/* Keep Screen Awake */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTextContainer}>
                    <AppText role="titleSmall" style={{color: '#FFFFFF'}}>
                      Keep Screen Awake
                    </AppText>
                    <AppText role="bodySmall" style={{color: '#A1A1AA'}}>
                      Prevents display timeout while reading
                    </AppText>
                  </View>
                  <Switch
                    value={settings.keepScreenAwake}
                    onValueChange={keepScreenAwake =>
                      onUpdateSettings({keepScreenAwake})
                    }
                    thumbColor={settings.keepScreenAwake ? '#7C4DFF' : '#71717A'}
                    trackColor={{false: '#3F3F46', true: 'rgba(124, 77, 255, 0.4)'}}
                  />
                </View>

                {/* Volume Key Page Turn */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTextContainer}>
                    <AppText role="titleSmall" style={{color: '#FFFFFF'}}>
                      Volume Key Page Turn
                    </AppText>
                    <AppText role="bodySmall" style={{color: '#A1A1AA'}}>
                      Volume Up = Prev page, Volume Down = Next page
                    </AppText>
                  </View>
                  <Switch
                    value={settings.volumeKeysEnabled}
                    onValueChange={volumeKeysEnabled =>
                      onUpdateSettings({volumeKeysEnabled})
                    }
                    thumbColor={settings.volumeKeysEnabled ? '#7C4DFF' : '#71717A'}
                    trackColor={{false: '#3F3F46', true: 'rgba(124, 77, 255, 0.4)'}}
                  />
                </View>

                {/* Show Floating Page Number */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTextContainer}>
                    <AppText role="titleSmall" style={{color: '#FFFFFF'}}>
                      Floating Page Indicator
                    </AppText>
                    <AppText role="bodySmall" style={{color: '#A1A1AA'}}>
                      Displays a subtle page counter pill in the bottom corner
                    </AppText>
                  </View>
                  <Switch
                    value={settings.showFloatingPageNumber}
                    onValueChange={showFloatingPageNumber =>
                      onUpdateSettings({showFloatingPageNumber})
                    }
                    thumbColor={settings.showFloatingPageNumber ? '#7C4DFF' : '#71717A'}
                    trackColor={{false: '#3F3F46', true: 'rgba(124, 77, 255, 0.4)'}}
                  />
                </View>

                {/* Disable Tap Zones in Webtoon */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTextContainer}>
                    <AppText role="titleSmall" style={{color: '#FFFFFF'}}>
                      Disable Tap Zones in Webtoon
                    </AppText>
                    <AppText role="bodySmall" style={{color: '#A1A1AA'}}>
                      Only scroll gestures turn pages; taps toggle HUD
                    </AppText>
                  </View>
                  <Switch
                    value={settings.disableTapZonesInWebtoon}
                    onValueChange={disableTapZonesInWebtoon =>
                      onUpdateSettings({disableTapZonesInWebtoon})
                    }
                    thumbColor={
                      settings.disableTapZonesInWebtoon ? '#7C4DFF' : '#71717A'
                    }
                    trackColor={{false: '#3F3F46', true: 'rgba(124, 77, 255, 0.4)'}}
                  />
                </View>

                {/* Live Manga Translation (A/文) */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTextContainer}>
                    <AppText role="titleSmall" style={{color: '#FFFFFF'}}>
                      Live Manga Translation (A/文)
                    </AppText>
                    <AppText role="bodySmall" style={{color: '#A1A1AA'}}>
                      Zero-Key Uncensored AI Translator with Spatial Bubble Clustering
                    </AppText>
                  </View>
                  <Switch
                    value={settings.liveTranslateEnabled ?? false}
                    onValueChange={liveTranslateEnabled =>
                      onUpdateSettings({liveTranslateEnabled})
                    }
                    thumbColor={
                      settings.liveTranslateEnabled ? '#7C4DFF' : '#71717A'
                    }
                    trackColor={{false: '#3F3F46', true: 'rgba(124, 77, 255, 0.4)'}}
                  />
                </View>
              </View>
            </BottomSheetScrollView>
          </BottomSheet>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingTop: 4,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#27272A',
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: '#D4D4D8',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
  },
  themeOptionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  themeCard: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  selectedIcon: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  scaleOptionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  scaleCard: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  scaleCardActive: {
    backgroundColor: '#7C4DFF',
    borderColor: '#7C4DFF',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#27272A',
  },
  toggleTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
});
