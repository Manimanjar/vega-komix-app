import React, {useCallback, useMemo, useRef} from 'react';
import {
  Modal,
  StyleSheet,
  Switch,
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
import {PressScale} from './readerMotion';

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

const SCALE_OPTIONS: Array<{
  scale: ImageScale;
  label: string;
  icon: string;
}> = [
  {scale: 'fit_height', label: 'Fit Height', icon: 'arrow-expand-vertical'},
  {scale: 'fit_width', label: 'Fit Width', icon: 'arrow-expand-horizontal'},
  {scale: 'fit_screen', label: 'Fit Screen', icon: 'fit-to-screen-outline'},
  {scale: 'full_screen', label: 'Full Screen', icon: 'fullscreen'},
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
                <PressScale onPress={onClose} style={styles.closeBtn}>
                  <MaterialCommunityIcons name="close" size={20} color="#A1A1AA" />
                </PressScale>
              </View>

              {/* 1. IMAGE FIT & SCALING — one straight horizontal row of five
                  equal buttons (user, 2026-11-18). The old 2-column wrapping
                  grid (48% each) made the buttons huge and stacked in three
                  rows. Now each button is flex:1, so all five sit in one
                  line in portrait AND landscape; only the gap between them
                  grows in landscape, so the row always looks filled and
                  the alignment never changes. Labels are short and centred
                  under the icon so they fit the narrow buttons. */}
              <View style={styles.section}>
                <AppText role="labelLargeEmphasized" style={styles.sectionLabel}>
                  Image Fit & Scaling
                </AppText>
                <View style={styles.scaleGrid}>
                  {SCALE_OPTIONS.map(opt => {
                    const isSelected = settings.imageScale === opt.scale;
                    return (
                      <PressScale
                        key={opt.scale}
                        onPress={() => onUpdateSettings({imageScale: opt.scale})}
                        style={[
                          styles.scaleCard,
                          isSelected && styles.scaleCardActive,
                        ]}>
                        <MaterialCommunityIcons
                          name={opt.icon as any}
                          size={20}
                          color={isSelected ? '#7C4DFF' : '#A1A1AA'}
                        />
                        <AppText
                          role="labelSmallEmphasized"
                          numberOfLines={2}
                          style={{
                            color: isSelected ? '#FFFFFF' : '#A1A1AA',
                            marginTop: 5,
                            textAlign: 'center',
                            fontSize: 10,
                            lineHeight: 12,
                          }}>
                          {opt.label}
                        </AppText>
                      </PressScale>
                    );
                  })}
                </View>
              </View>

              {/* 2. DISPLAY & EYE CARE (Warm Night Filter kept — see fix list) */}
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

              {/* 3. QUICK PAGE & CHAPTER TOOLS — same one-row treatment as the
                  fit buttons (user, 2026-11-18): four equal buttons in a
                  single horizontal line, icon above a short centred label,
                  flex:1 so the row stays aligned in portrait and landscape
                  and only the spacing grows. Labels are shortened to fit the
                  narrow buttons ("First Page", "Reload", "Download"). */}
              <View style={styles.section}>
                <AppText role="labelLargeEmphasized" style={styles.sectionLabel}>
                  Quick Page & Chapter Tools
                </AppText>
                <View style={styles.toolsGrid}>
                  {/* Tool 1: Jump to First Page */}
                  <PressScale
                    onPress={() => {
                      onJumpToFirstPage?.();
                      onClose();
                    }}
                    style={styles.toolCard}>
                    <MaterialCommunityIcons
                      name="skip-backward-outline"
                      size={20}
                      color="#7C4DFF"
                    />
                    <AppText
                      role="labelMediumEmphasized"
                      numberOfLines={2}
                      style={styles.toolCardLabel}>
                      First Page
                    </AppText>
                  </PressScale>

                  {/* Tool 2: Reload Current Page */}
                  <PressScale
                    onPress={() => {
                      onReloadCurrentPage?.();
                    }}
                    style={styles.toolCard}>
                    <MaterialCommunityIcons
                      name="refresh"
                      size={20}
                      color="#00E5FF"
                    />
                    <AppText
                      role="labelMediumEmphasized"
                      numberOfLines={2}
                      style={styles.toolCardLabel}>
                      Reload
                    </AppText>
                  </PressScale>

                  {/* Tool 3: Quality Toggle */}
                  <PressScale
                    onPress={() => {
                      onToggleQuality?.();
                    }}
                    style={styles.toolCard}>
                    <MaterialCommunityIcons
                      name={quality === 'original' ? 'high-definition' : 'tune'}
                      size={20}
                      color="#00E676"
                    />
                    <AppText
                      role="labelMediumEmphasized"
                      numberOfLines={2}
                      style={styles.toolCardLabel}>
                      {quality === 'original' ? 'Quality: HD' : 'Quality: Saver'}
                    </AppText>
                  </PressScale>

                  {/* Tool 4: Download Chapter */}
                  <PressScale
                    onPress={() => {
                      onDownloadChapter?.();
                    }}
                    style={styles.toolCard}>
                    <MaterialCommunityIcons
                      name="download-outline"
                      size={20}
                      color="#FFB300"
                    />
                    <AppText
                      role="labelMediumEmphasized"
                      numberOfLines={2}
                      style={styles.toolCardLabel}>
                      Download
                    </AppText>
                  </PressScale>
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
  scaleGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
  },
  scaleCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 2,
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
    flexWrap: 'nowrap',
    gap: 8,
  },
  toolCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 12,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  toolCardLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
  },
});
