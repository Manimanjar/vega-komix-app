import React, {useCallback, useMemo, useRef} from 'react';
import {
  Modal,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from '../ui/Text';
import type {ImageScale, ReaderSettings} from './types';

interface ReaderSettingsSheetProps {
  visible: boolean;
  settings: ReaderSettings;
  quality?: 'original' | 'compressed';
  onUpdateSettings: (newSettings: Partial<ReaderSettings>) => void;
  onClose: () => void;
  onJumpToFirstPage?: () => void;
  onReloadCurrentPage?: () => void;
  onToggleQuality?: () => void;
  onDownloadChapter?: () => void;
  incognitoEnabled?: boolean;
  onToggleIncognito?: () => void;
}

const ZOOM_LEVELS: Array<{value: number; label: string}> = [
  {value: 1.0, label: '1.0x (Reset)'},
  {value: 1.25, label: '1.25x'},
  {value: 1.5, label: '1.5x'},
  {value: 2.0, label: '2.0x'},
  {value: 2.5, label: '2.5x'},
];

const SCALE_OPTIONS: Array<{
  scale: ImageScale;
  label: string;
  icon: string;
}> = [
  {scale: 'fit_height', label: 'Fit Height', icon: 'arrow-expand-vertical'},
  {scale: 'fit_screen', label: 'Fit Screen', icon: 'fit-to-screen-outline'},
  {scale: 'original', label: 'Original', icon: 'aspect-ratio'},
];

export const ReaderSettingsSheet: React.FC<ReaderSettingsSheetProps> = ({
  visible,
  settings,
  quality = 'original',
  onUpdateSettings,
  onClose,
  onJumpToFirstPage,
  onReloadCurrentPage,
  onToggleQuality,
  onDownloadChapter,
  incognitoEnabled = false,
  onToggleIncognito,
}) => {
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['75%', '92%'], []);

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

  const currentZoom = settings.zoomScale ?? 1.0;
  const isWarmFilter = settings.warmFilterEnabled ?? false;
  const isSplitSpreads = settings.splitDoubleSpreads ?? true;
  const isHighQuality = settings.highQualityRendering ?? true;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      {/* The gesture-handler root must live INSIDE the Modal: a Modal renders
          in a separate native window above the app's GestureHandlerRootView,
          so without this the sheet's pan/scroll gestures are dead on Android
          and only the hardware back button can close it. Backdrop taps are
          handled by BottomSheetBackdrop (pressBehavior="close"); there is no
          outer Pressable here on purpose — one used to swallow every tap. */}
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <BottomSheet
          ref={sheetRef}
          snapPoints={snapPoints}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
          onClose={onClose}
          backgroundStyle={{backgroundColor: '#000000'}}
          handleIndicatorStyle={{backgroundColor: '#52525B'}}>
          <BottomSheetScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.headerRow}>
                <View>
                  <AppText role="titleLargeEmphasized" style={{color: '#FFFFFF'}}>
                    Quick Reader Settings
                  </AppText>
                  <AppText role="bodySmall" style={{color: '#71717A', marginTop: 2}}>
                    Live reader adjustments & display tools
                  </AppText>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <MaterialCommunityIcons name="close" size={20} color="#A1A1AA" />
                </TouchableOpacity>
              </View>

              {/* 1. LIVE ZOOM LEVEL */}
              <View style={styles.section}>
                <AppText role="labelLargeEmphasized" style={styles.sectionLabel}>
                  Live Zoom Level
                </AppText>
                <View style={styles.chipRow}>
                  {ZOOM_LEVELS.map(opt => {
                    const isSelected = Math.abs(currentZoom - opt.value) < 0.05;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => onUpdateSettings({zoomScale: opt.value})}
                        style={[
                          styles.chip,
                          isSelected && styles.chipActive,
                        ]}>
                        <AppText
                          role="labelMediumEmphasized"
                          style={{
                            color: isSelected ? '#FFFFFF' : '#A1A1AA',
                            fontSize: 12,
                          }}>
                          {opt.label}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* 2. IMAGE FIT & SCALING */}
              <View style={styles.section}>
                <AppText role="labelLargeEmphasized" style={styles.sectionLabel}>
                  Image Fit & Scaling
                </AppText>
                <View style={styles.scaleGrid}>
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
                          size={22}
                          color={isSelected ? '#7C4DFF' : '#A1A1AA'}
                        />
                        <AppText
                          role="labelSmallEmphasized"
                          style={{
                            color: isSelected ? '#FFFFFF' : '#A1A1AA',
                            marginTop: 6,
                            textAlign: 'center',
                            fontSize: 11,
                          }}>
                          {opt.label}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* 3. DISPLAY & EYE CARE (Warm Night Filter kept — see fix list) */}
              <View style={styles.section}>
                <AppText role="labelLargeEmphasized" style={styles.sectionLabel}>
                  Display & Eye Care
                </AppText>

                {/* Warm Night Filter Pill Toggle */}
                <View style={styles.warmFilterRow}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1}}>
                    <MaterialCommunityIcons
                      name="weather-night"
                      size={22}
                      color={isWarmFilter ? '#FFAA00' : '#71717A'}
                    />
                    <View style={{flex: 1}}>
                      <AppText role="titleSmall" style={{color: '#FFFFFF'}}>
                        Warm Night Filter
                      </AppText>
                      <AppText role="bodySmall" style={{color: '#71717A'}}>
                        Soft amber tint reduces blue light fatigue
                      </AppText>
                    </View>
                  </View>
                  <Switch
                    value={isWarmFilter}
                    onValueChange={warmFilterEnabled =>
                      onUpdateSettings({warmFilterEnabled})
                    }
                    thumbColor={isWarmFilter ? '#FFAA00' : '#71717A'}
                    trackColor={{false: '#27272A', true: 'rgba(255, 170, 0, 0.4)'}}
                  />
                </View>

                {/* Incognito / Ghost Reading Mode */}
                <View style={[styles.warmFilterRow, {marginTop: 10}]}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1}}>
                    <MaterialCommunityIcons
                      name="ghost"
                      size={22}
                      color={incognitoEnabled ? '#E040FB' : '#71717A'}
                    />
                    <View style={{flex: 1}}>
                      <AppText role="titleSmall" style={{color: '#FFFFFF'}}>
                        Incognito / Ghost Mode
                      </AppText>
                      <AppText role="bodySmall" style={{color: '#71717A'}}>
                        Do not record chapter progress or reading history
                      </AppText>
                    </View>
                  </View>
                  <Switch
                    value={incognitoEnabled}
                    onValueChange={onToggleIncognito}
                    thumbColor={incognitoEnabled ? '#E040FB' : '#71717A'}
                    trackColor={{false: '#27272A', true: 'rgba(224, 64, 251, 0.4)'}}
                  />
                </View>

                {/* Split Double-Page Spreads */}
                <View style={[styles.warmFilterRow, {marginTop: 10}]}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1}}>
                    <MaterialCommunityIcons
                      name="book-open-page-variant-outline"
                      size={22}
                      color={isSplitSpreads ? '#00E5FF' : '#71717A'}
                    />
                    <View style={{flex: 1}}>
                      <AppText role="titleSmall" style={{color: '#FFFFFF'}}>
                        Split Double-Page Spreads
                      </AppText>
                      <AppText role="bodySmall" style={{color: '#71717A'}}>
                        Split wide 2-page landscape scans into two portrait pages
                      </AppText>
                    </View>
                  </View>
                  <Switch
                    value={isSplitSpreads}
                    onValueChange={splitDoubleSpreads =>
                      onUpdateSettings({splitDoubleSpreads})
                    }
                    thumbColor={isSplitSpreads ? '#00E5FF' : '#71717A'}
                    trackColor={{false: '#27272A', true: 'rgba(0, 229, 255, 0.4)'}}
                  />
                </View>

                {/* High-Quality 32-Bit Image Rendering */}
                <View style={[styles.warmFilterRow, {marginTop: 10}]}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1}}>
                    <MaterialCommunityIcons
                      name="image-filter-hdr"
                      size={22}
                      color={isHighQuality ? '#7C4DFF' : '#71717A'}
                    />
                    <View style={{flex: 1}}>
                      <AppText role="titleSmall" style={{color: '#FFFFFF'}}>
                        Original Quality (32-bit ARGB)
                      </AppText>
                      <AppText role="bodySmall" style={{color: '#71717A'}}>
                        100% full original resolution without downsampling. Keep ON for best clarity
                      </AppText>
                    </View>
                  </View>
                  <Switch
                    value={isHighQuality}
                    onValueChange={highQualityRendering =>
                      onUpdateSettings({highQualityRendering})
                    }
                    thumbColor={isHighQuality ? '#7C4DFF' : '#71717A'}
                    trackColor={{false: '#27272A', true: 'rgba(124, 77, 255, 0.4)'}}
                  />
                </View>
              </View>

              {/* 4. QUICK PAGE & CHAPTER TOOLS */}
              <View style={styles.section}>
                <AppText role="labelLargeEmphasized" style={styles.sectionLabel}>
                  Quick Page & Chapter Tools
                </AppText>
                <View style={styles.toolsGrid}>
                  {/* Tool 1: Jump to First Page */}
                  <TouchableOpacity
                    onPress={() => {
                      onJumpToFirstPage?.();
                      onClose();
                    }}
                    style={styles.toolCard}>
                    <MaterialCommunityIcons
                      name="skip-backward-outline"
                      size={22}
                      color="#7C4DFF"
                    />
                    <AppText
                      role="labelMediumEmphasized"
                      style={styles.toolCardLabel}>
                      Jump to First Page
                    </AppText>
                  </TouchableOpacity>

                  {/* Tool 2: Reload Current Page */}
                  <TouchableOpacity
                    onPress={() => {
                      onReloadCurrentPage?.();
                    }}
                    style={styles.toolCard}>
                    <MaterialCommunityIcons
                      name="refresh"
                      size={22}
                      color="#00E5FF"
                    />
                    <AppText
                      role="labelMediumEmphasized"
                      style={styles.toolCardLabel}>
                      Reload Page
                    </AppText>
                  </TouchableOpacity>

                  {/* Tool 3: Quality Toggle */}
                  <TouchableOpacity
                    onPress={() => {
                      onToggleQuality?.();
                    }}
                    style={styles.toolCard}>
                    <MaterialCommunityIcons
                      name={quality === 'original' ? 'high-definition' : 'tune'}
                      size={22}
                      color="#00E676"
                    />
                    <AppText
                      role="labelMediumEmphasized"
                      style={styles.toolCardLabel}>
                      {quality === 'original' ? 'Quality: HD' : 'Quality: Saver'}
                    </AppText>
                  </TouchableOpacity>

                  {/* Tool 4: Download Chapter */}
                  <TouchableOpacity
                    onPress={() => {
                      onDownloadChapter?.();
                    }}
                    style={styles.toolCard}>
                    <MaterialCommunityIcons
                      name="download-outline"
                      size={22}
                      color="#FFB300"
                    />
                    <AppText
                      role="labelMediumEmphasized"
                      style={styles.toolCardLabel}>
                      Download Chapter
                    </AppText>
                  </TouchableOpacity>
                </View>
              </View>
            </BottomSheetScrollView>
          </BottomSheet>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    backgroundColor: '#000000',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 14,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 18,
    backgroundColor: '#18181B',
  },
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    color: '#D4D4D8',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  chipActive: {
    backgroundColor: '#7C4DFF',
    borderColor: '#7C4DFF',
  },
  scaleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scaleCard: {
    width: '48%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  scaleCardActive: {
    backgroundColor: 'rgba(124, 77, 255, 0.15)',
    borderColor: '#7C4DFF',
  },
  warmFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  toolCardLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    flex: 1,
  },
});
