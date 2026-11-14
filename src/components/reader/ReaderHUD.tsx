import React, {useState} from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Slider from '@react-native-community/slider';
import AppText from '../ui/Text';
import type {EpisodeLink} from '../../lib/providers/types';
import type {
  ReaderTheme,
  ReadingMode,
  ScreenOrientationMode,
} from './types';
import {THEME_COLORS} from './types';
import type {TranslationStatus} from '../../lib/translator/mangaTranslatorEngine';

interface ReaderHUDProps {
  visible: boolean;
  title: string;
  chapterTitle: string;
  currentPage: number;
  totalPages: number;
  allChapters: EpisodeLink[];
  currentChapterIndex: number;
  readingMode: ReadingMode;
  orientationMode: ScreenOrientationMode;
  quality: 'original' | 'compressed';
  theme: ReaderTheme;
  turboBadgeText?: string;
  translateEnabled?: boolean;
  translationStatus?: TranslationStatus;
  onToggleTranslate?: () => void;
  onBack: () => void;
  onSelectChapter: (index: number) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onPageSliderChange: (pageIndex: number) => void;
  onToggleReadingMode: () => void;
  onToggleOrientation: () => void;
  onToggleQuality: () => void;
  onOpenWafBypass: () => void;
  onOpenSettings: () => void;
}

const READING_MODE_LABELS: Record<ReadingMode, {label: string; icon: string}> = {
  webtoon: {label: 'Webtoon', icon: 'view-headline'},
  manga: {label: 'Manga (RTL)', icon: 'book-open-page-variant'},
  comic: {label: 'Comic (LTR)', icon: 'book-open-variant'},
  double_spread: {label: 'Double Spread', icon: 'book-open-outline'},
};

const ORIENTATION_LABELS: Record<
  ScreenOrientationMode,
  {label: string; icon: string}
> = {
  auto: {label: 'Auto', icon: 'screen-rotation'},
  portrait: {label: 'Portrait', icon: 'phone-rotate-landscape'},
  landscape: {label: 'Landscape', icon: 'phone-rotate-portrait'},
};

export const ReaderHUD: React.FC<ReaderHUDProps> = ({
  visible,
  title,
  chapterTitle,
  currentPage,
  totalPages,
  allChapters,
  currentChapterIndex,
  readingMode,
  orientationMode,
  quality,
  theme,
  turboBadgeText = 'Turbo: +8 Ready',
  translateEnabled = false,
  translationStatus = 'idle',
  onToggleTranslate,
  onBack,
  onSelectChapter,
  onPrevChapter,
  onNextChapter,
  onPageSliderChange,
  onToggleReadingMode,
  onToggleOrientation,
  onToggleQuality,
  onOpenWafBypass,
  onOpenSettings,
}) => {
  const insets = useSafeAreaInsets();
  const themeColors = THEME_COLORS[theme];
  const [chapterModalVisible, setChapterModalVisible] = useState(false);

  if (!visible) return null;

  const modeInfo = READING_MODE_LABELS[readingMode];
  const orientationInfo = ORIENTATION_LABELS[orientationMode];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Top HUD */}
      <View
        style={[
          styles.topHud,
          {
            paddingTop: Math.max(insets.top, 14),
            backgroundColor: themeColors.hudBackground,
            borderBottomColor: themeColors.hudBorder,
          },
        ]}>
        <View style={styles.topHudRow}>
          {/* Back button */}
          <TouchableOpacity
            onPress={onBack}
            style={styles.iconButton}
            accessibilityLabel="Go back">
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={themeColors.text}
            />
          </TouchableOpacity>

          {/* Title & Chapter selector */}
          <TouchableOpacity
            onPress={() => setChapterModalVisible(true)}
            style={styles.titleContainer}>
            <AppText
              numberOfLines={1}
              role="titleMediumEmphasized"
              style={{color: themeColors.text}}>
              {title}
            </AppText>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
              <AppText
                numberOfLines={1}
                role="bodySmall"
                style={{color: themeColors.subText, maxWidth: 220}}>
                {chapterTitle || `Chapter ${currentChapterIndex + 1}`}
              </AppText>
              <MaterialCommunityIcons
                name="chevron-down"
                size={16}
                color={themeColors.subText}
              />
            </View>
          </TouchableOpacity>

          {/* Action icons: Turbo Live Badge, Quality, WAF WebView Bypass */}
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <View
              style={[
                styles.turboBadge,
                {
                  borderColor: 'rgba(0, 230, 118, 0.4)',
                  backgroundColor: 'rgba(0, 230, 118, 0.12)',
                },
              ]}>
              <MaterialCommunityIcons
                name="lightning-bolt"
                size={12}
                color="#00E676"
                style={{marginRight: 2}}
              />
              <AppText
                role="labelSmall"
                style={{
                  color: '#00E676',
                  fontWeight: '800',
                  fontSize: 10,
                }}>
                {turboBadgeText}
              </AppText>
            </View>

            <TouchableOpacity
              onPress={onToggleQuality}
              style={[
                styles.qualityBadge,
                {borderColor: themeColors.hudBorder},
              ]}
              accessibilityLabel={`Quality: ${quality}`}>
              <AppText
                role="labelSmall"
                style={{
                  color: quality === 'original' ? '#7C4DFF' : themeColors.subText,
                  fontWeight: '700',
                  fontSize: 10,
                }}>
                {quality === 'original' ? 'ORIG' : 'DATA'}
              </AppText>
            </TouchableOpacity>

            {/* Live Translate [A/文] Pill */}
            {onToggleTranslate && (
              <TouchableOpacity
                onPress={onToggleTranslate}
                style={[
                  styles.translatePill,
                  {
                    borderColor: translateEnabled ? '#7C4DFF' : themeColors.hudBorder,
                    backgroundColor: translateEnabled
                      ? 'rgba(124, 77, 255, 0.16)'
                      : 'rgba(0, 0, 0, 0.35)',
                  },
                ]}
                accessibilityLabel={`Live Translate: ${translateEnabled ? 'ON' : 'OFF'} (${translationStatus})`}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor:
                        translationStatus === 'translating'
                          ? '#FFD600'
                          : translationStatus === 'translated'
                          ? '#00E676'
                          : translationStatus === 'error'
                          ? '#FF5252'
                          : '#888888',
                    },
                  ]}
                />
                <AppText
                  role="labelSmall"
                  style={{
                    color: translateEnabled ? '#B388FF' : themeColors.text,
                    fontWeight: '800',
                    fontSize: 10,
                  }}>
                  {translationStatus === 'translating' ? 'A/文...' : 'A/文'}
                </AppText>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={onOpenWafBypass}
              style={styles.iconButton}
              accessibilityLabel="WAF WebView Bypass">
              <MaterialCommunityIcons
                name="shield-check"
                size={22}
                color="#00B0FF"
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Bottom HUD */}
      <View
        style={[
          styles.bottomHud,
          {
            paddingBottom: Math.max(insets.bottom, 14),
            backgroundColor: themeColors.hudBackground,
            borderTopColor: themeColors.hudBorder,
          },
        ]}>
        {/* Page Slider row */}
        <View style={styles.sliderRow}>
          <AppText
            role="labelMedium"
            style={{color: themeColors.subText, minWidth: 44, textAlign: 'center'}}>
            {currentPage + 1} / {Math.max(1, totalPages)}
          </AppText>

          <Slider
            style={{flex: 1, height: 38}}
            minimumValue={1}
            maximumValue={Math.max(1, totalPages)}
            step={1}
            value={currentPage + 1}
            minimumTrackTintColor="#7C4DFF"
            maximumTrackTintColor="rgba(255, 255, 255, 0.25)"
            thumbTintColor="#7C4DFF"
            onValueChange={val => onPageSliderChange(val - 1)}
          />

          <AppText
            role="labelSmall"
            style={{color: themeColors.subText, minWidth: 40, textAlign: 'center'}}>
            {totalPages > 0
              ? `${Math.round(((currentPage + 1) / totalPages) * 100)}%`
              : '0%'}
          </AppText>
        </View>

        {/* Control Buttons row */}
        <View style={styles.controlsRow}>
          {/* Prev Chapter */}
          <TouchableOpacity
            onPress={onPrevChapter}
            disabled={currentChapterIndex <= 0}
            style={[
              styles.controlButton,
              currentChapterIndex <= 0 && {opacity: 0.35},
            ]}>
            <MaterialCommunityIcons
              name="skip-previous"
              size={22}
              color={themeColors.text}
            />
            <AppText role="labelSmall" style={{color: themeColors.text}}>
              Prev Ch
            </AppText>
          </TouchableOpacity>

          {/* Reading Mode Button */}
          <TouchableOpacity
            onPress={onToggleReadingMode}
            style={styles.controlButton}>
            <MaterialCommunityIcons
              name={modeInfo.icon as any}
              size={20}
              color="#7C4DFF"
            />
            <AppText
              role="labelSmall"
              style={{color: '#7C4DFF', fontWeight: '700'}}>
              {modeInfo.label}
            </AppText>
          </TouchableOpacity>

          {/* Orientation Toggle */}
          <TouchableOpacity
            onPress={onToggleOrientation}
            style={styles.controlButton}>
            <MaterialCommunityIcons
              name={orientationInfo.icon as any}
              size={20}
              color={themeColors.text}
            />
            <AppText role="labelSmall" style={{color: themeColors.text}}>
              {orientationInfo.label}
            </AppText>
          </TouchableOpacity>

          {/* Next Chapter */}
          <TouchableOpacity
            onPress={onNextChapter}
            disabled={currentChapterIndex >= allChapters.length - 1}
            style={[
              styles.controlButton,
              currentChapterIndex >= allChapters.length - 1 && {opacity: 0.35},
            ]}>
            <MaterialCommunityIcons
              name="skip-next"
              size={22}
              color={themeColors.text}
            />
            <AppText role="labelSmall" style={{color: themeColors.text}}>
              Next Ch
            </AppText>
          </TouchableOpacity>

          {/* Settings Button */}
          <TouchableOpacity
            onPress={onOpenSettings}
            style={styles.controlButton}>
            <MaterialCommunityIcons
              name="cog-outline"
              size={22}
              color={themeColors.text}
            />
            <AppText role="labelSmall" style={{color: themeColors.text}}>
              Settings
            </AppText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chapter Switcher Modal */}
      <Modal
        visible={chapterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChapterModalVisible(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setChapterModalVisible(false)}>
          <View
            style={[
              styles.chapterModalContent,
              {
                backgroundColor: themeColors.hudBackground,
                borderColor: themeColors.hudBorder,
              },
            ]}>
            <View style={styles.chapterModalHeader}>
              <AppText role="titleMediumEmphasized" style={{color: themeColors.text}}>
                Chapters ({allChapters.length})
              </AppText>
              <TouchableOpacity onPress={() => setChapterModalVisible(false)}>
                <MaterialCommunityIcons
                  name="close"
                  size={20}
                  color={themeColors.subText}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={{maxHeight: 380}}>
              {allChapters.map((ch, idx) => {
                const isSelected = idx === currentChapterIndex;
                return (
                  <TouchableOpacity
                    key={`${ch.link}-${idx}`}
                    onPress={() => {
                      setChapterModalVisible(false);
                      onSelectChapter(idx);
                    }}
                    style={[
                      styles.chapterRow,
                      isSelected && {
                        backgroundColor: 'rgba(124, 77, 255, 0.15)',
                      },
                    ]}>
                    <MaterialCommunityIcons
                      name={isSelected ? 'bookmark-check' : 'bookmark-outline'}
                      size={18}
                      color={isSelected ? '#7C4DFF' : themeColors.subText}
                    />
                    <AppText
                      numberOfLines={1}
                      role={isSelected ? 'bodyMediumEmphasized' : 'bodyMedium'}
                      style={{
                        color: isSelected ? '#7C4DFF' : themeColors.text,
                        flex: 1,
                      }}>
                      {ch.title || `Chapter ${idx + 1}`}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  topHud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 20,
  },
  topHudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  titleContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  qualityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turboBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  translatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bottomHud: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    zIndex: 20,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  chapterModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    elevation: 20,
  },
  chapterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
});
