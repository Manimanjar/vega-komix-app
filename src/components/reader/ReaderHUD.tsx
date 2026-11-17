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
  InteractionMode,
  ReaderTheme,
  ReadingMode,
  ScreenOrientationMode,
} from './types';
import type {TranslationStatus} from '../../lib/translator/mangaTranslatorEngine';
import {useTranslatedTitle} from '../../lib/translator/useTranslatedTitle';

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
  interactionMode?: InteractionMode;
  quality?: 'original' | 'compressed';
  theme: ReaderTheme;
  turboBadgeText?: string;
  translateEnabled?: boolean;
  translationStatus?: TranslationStatus;
  onToggleTranslate?: () => void;
  incognitoEnabled?: boolean;
  onToggleIncognito?: () => void;
  onBack: () => void;
  onSelectChapter: (index: number) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  hasPrevChapter?: boolean;
  hasNextChapter?: boolean;
  onPageSliderChange?: (pageIndex: number) => void;
  onPageSliderCommit?: (pageIndex: number) => void;
  onToggleReadingMode: () => void;
  onToggleOrientation: () => void;
  onToggleInteractionMode?: () => void;
  onToggleQuality?: () => void;
  onOpenWafBypass?: () => void;
  onOpenSettings: () => void;
  onTouchActivity?: () => void;
}

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
  interactionMode = 'scroll',
  translateEnabled = false,
  translationStatus = 'idle',
  onToggleTranslate,
  incognitoEnabled = false,
  onToggleIncognito,
  onBack,
  onSelectChapter,
  onPrevChapter,
  onNextChapter,
  hasPrevChapter,
  hasNextChapter,
  onPageSliderChange,
  onPageSliderCommit,
  onToggleReadingMode,
  onToggleOrientation,
  onToggleInteractionMode,
  onOpenSettings,
  onTouchActivity,
}) => {
  const insets = useSafeAreaInsets();
  const [chapterModalVisible, setChapterModalVisible] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubbingValue, setScrubbingValue] = useState<number | null>(null);
  // Translated title in the top bar (cache is usually warm from Detail).
  const {translated: translatedTitle} = useTranslatedTitle(title);

  if (!visible) return null;

  const isWebtoon = readingMode === 'webtoon';
  const isLandscape = orientationMode === 'landscape';

  // Navigation mode labels & icons
  let navModeLabel = 'Scroll';
  let navModeIcon = 'gesture-swipe-vertical';

  if (isWebtoon) {
    if (interactionMode === 'one_tap') {
      navModeLabel = 'One Tap';
      navModeIcon = 'gesture-tap';
    } else {
      navModeLabel = 'Scroll';
      navModeIcon = 'gesture-swipe-vertical';
    }
  } else {
    if (interactionMode === 'one_tap') {
      navModeLabel = 'One Tap';
      navModeIcon = 'gesture-tap';
    } else {
      navModeLabel = 'Swipe';
      navModeIcon = 'gesture-swipe-horizontal';
    }
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onTouchStart={onTouchActivity}>
      {/* Top HUD: Sleek dark glassmorphic bar */}
      <View
        style={[
          styles.topHud,
          {
            paddingTop: Math.max(insets.top, 14),
          },
        ]}>
        <View style={styles.topHudRow}>
          {/* Left: Back button + Comic Title & Chapter X ▾ */}
          <TouchableOpacity
            onPress={onBack}
            style={styles.iconButton}
            accessibilityLabel="Go back">
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setChapterModalVisible(true)}
            style={styles.titleContainer}>
            <AppText
              numberOfLines={1}
              role="titleMediumEmphasized"
              style={{color: '#FFFFFF'}}>
              {translatedTitle}
            </AppText>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
              <AppText
                numberOfLines={1}
                role="bodySmall"
                style={{color: 'rgba(255, 255, 255, 0.7)', maxWidth: 200}}>
                {chapterTitle || `Chapter ${currentChapterIndex + 1}`}
              </AppText>
              <MaterialCommunityIcons
                name="chevron-down"
                size={16}
                color="rgba(255, 255, 255, 0.7)"
              />
            </View>
          </TouchableOpacity>

          {/* Right: 1-Tap Reading Mode Pill + [A/文] Translate Pill */}
          <View style={styles.topRightActions}>
            {/* 1-Tap Reading Mode Button: Continuous <-> Page by Page */}
            <TouchableOpacity
              onPress={onToggleReadingMode}
              style={styles.readingModePill}
              accessibilityLabel={`Reading mode: ${isWebtoon ? 'Continuous' : 'Page by Page'}`}>
              <MaterialCommunityIcons
                name={isWebtoon ? 'view-headline' : 'book-open-page-variant'}
                size={16}
                color={isWebtoon ? '#7C4DFF' : '#00E5FF'}
              />
              <AppText
                role="labelSmall"
                style={{
                  color: '#FFFFFF',
                  fontWeight: '700',
                  fontSize: 11,
                }}>
                {isWebtoon ? 'Continuous' : 'Page by Page'}
              </AppText>
            </TouchableOpacity>

            {/* Live Translate [A/文] Pill */}
            {onToggleTranslate && (
              <TouchableOpacity
                onPress={onToggleTranslate}
                style={[
                  styles.translatePill,
                  {
                    borderColor: translateEnabled ? '#7C4DFF' : 'rgba(255, 255, 255, 0.15)',
                    backgroundColor: translateEnabled
                      ? 'rgba(124, 77, 255, 0.22)'
                      : 'rgba(255, 255, 255, 0.08)',
                  },
                ]}
                accessibilityLabel={`Live Translate: ${translateEnabled ? 'ON' : 'OFF'}`}>
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
                    color: translateEnabled ? '#B388FF' : '#FFFFFF',
                    fontWeight: '800',
                    fontSize: 11,
                  }}>
                  {translationStatus === 'translating' ? 'A/文...' : 'A/文'}
                </AppText>
              </TouchableOpacity>
            )}

            {/* 1-Tap Incognito / Ghost Reading Mode Toggle */}
            {onToggleIncognito && (
              <TouchableOpacity
                onPress={onToggleIncognito}
                style={[
                  styles.incognitoPill,
                  incognitoEnabled && styles.incognitoPillActive,
                ]}
                accessibilityLabel={`Incognito Mode: ${incognitoEnabled ? 'ON' : 'OFF'}`}>
                <MaterialCommunityIcons
                  name="ghost"
                  size={16}
                  color={incognitoEnabled ? '#E040FB' : 'rgba(255, 255, 255, 0.7)'}
                />
                {incognitoEnabled && (
                  <AppText
                    role="labelSmall"
                    style={styles.incognitoPillText}>
                    Incognito
                  </AppText>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Bottom HUD: Sleek dark glassmorphic bar */}
      <View
        style={[
          styles.bottomHud,
          {
            paddingBottom: Math.max(insets.bottom, 14),
          },
        ]}>
        {/* Upper row: Clean page scrubber slider */}
        {(() => {
          const displayedPage =
            isScrubbing && scrubbingValue !== null ? scrubbingValue : currentPage;
          return (
            <View style={styles.sliderRow}>
              <AppText
                role="labelMedium"
                style={{color: 'rgba(255, 255, 255, 0.75)', minWidth: 46, textAlign: 'center'}}>
                Page {displayedPage + 1} / {Math.max(1, totalPages)}
              </AppText>

              <Slider
                style={{flex: 1, height: 38}}
                minimumValue={1}
                maximumValue={Math.max(1, totalPages)}
                step={1}
                value={displayedPage + 1}
                minimumTrackTintColor="#7C4DFF"
                maximumTrackTintColor="rgba(255, 255, 255, 0.22)"
                thumbTintColor="#7C4DFF"
                onSlidingStart={() => {
                  setIsScrubbing(true);
                  setScrubbingValue(currentPage);
                  onTouchActivity?.();
                }}
                onValueChange={val => {
                  const targetPage = Math.max(0, Math.min(Math.round(val) - 1, totalPages - 1));
                  setScrubbingValue(targetPage);
                  onTouchActivity?.();
                }}
                onSlidingComplete={val => {
                  const finalPage = Math.max(0, Math.min(Math.round(val) - 1, totalPages - 1));
                  setIsScrubbing(false);
                  setScrubbingValue(null);
                  onTouchActivity?.();
                  if (onPageSliderCommit) {
                    onPageSliderCommit(finalPage);
                  } else if (onPageSliderChange) {
                    onPageSliderChange(finalPage);
                  }
                }}
              />

              <AppText
                role="labelSmall"
                style={{color: 'rgba(255, 255, 255, 0.75)', minWidth: 40, textAlign: 'center'}}>
                {totalPages > 0
                  ? `${Math.round(((displayedPage + 1) / totalPages) * 100)}%`
                  : '0%'}
              </AppText>
            </View>
          );
        })()}

        {/* Lower row: 5 evenly spaced modern icon+label buttons */}
        <View style={styles.controlsRow}>
          {/* 1. Prev Ch */}
          {(() => {
            const canGoPrev =
              hasPrevChapter !== undefined ? hasPrevChapter : currentChapterIndex > 0;
            return (
              <TouchableOpacity
                onPress={onPrevChapter}
                disabled={!canGoPrev}
                style={[
                  styles.controlButton,
                  !canGoPrev && {opacity: 0.35},
                ]}>
                <MaterialCommunityIcons
                  name="skip-previous"
                  size={22}
                  color="#FFFFFF"
                />
                <AppText role="labelSmall" style={styles.controlButtonLabel}>
                  Prev Ch
                </AppText>
              </TouchableOpacity>
            );
          })()}

          {/* 2. 1-Tap Scrolling / Navigation Mode Button */}
          {onToggleInteractionMode && (
            <TouchableOpacity
              onPress={onToggleInteractionMode}
              style={[styles.controlButton, styles.navModeBadge]}>
              <MaterialCommunityIcons
                name={navModeIcon as any}
                size={20}
                color="#00E5FF"
              />
              <AppText
                role="labelSmall"
                style={[styles.controlButtonLabel, {color: '#00E5FF', fontWeight: '800'}]}>
                {navModeLabel}
              </AppText>
            </TouchableOpacity>
          )}

          {/* 3. 1-Tap Orientation Button (Portrait / Landscape) */}
          <TouchableOpacity
            onPress={onToggleOrientation}
            style={styles.controlButton}>
            <MaterialCommunityIcons
              name={isLandscape ? 'phone-rotate-portrait' : 'phone-rotate-landscape'}
              size={22}
              color={isLandscape ? '#A78BFA' : '#FFFFFF'}
            />
            <AppText
              role="labelSmall"
              style={[
                styles.controlButtonLabel,
                isLandscape && {color: '#A78BFA', fontWeight: '700'},
              ]}>
              {isLandscape ? 'Landscape' : 'Portrait'}
            </AppText>
          </TouchableOpacity>

          {/* 4. Next Ch */}
          {(() => {
            const canGoNext =
              hasNextChapter !== undefined
                ? hasNextChapter
                : currentChapterIndex < allChapters.length - 1;
            return (
              <TouchableOpacity
                onPress={onNextChapter}
                disabled={!canGoNext}
                style={[
                  styles.controlButton,
                  !canGoNext && {opacity: 0.35},
                ]}>
                <MaterialCommunityIcons
                  name="skip-next"
                  size={22}
                  color="#FFFFFF"
                />
                <AppText role="labelSmall" style={styles.controlButtonLabel}>
                  Next Ch
                </AppText>
              </TouchableOpacity>
            );
          })()}

          {/* 5. Settings */}
          <TouchableOpacity
            onPress={onOpenSettings}
            style={styles.controlButton}>
            <MaterialCommunityIcons
              name="cog-outline"
              size={22}
              color="#FFFFFF"
            />
            <AppText role="labelSmall" style={styles.controlButtonLabel}>
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
                backgroundColor: '#121218',
                borderColor: 'rgba(255, 255, 255, 0.1)',
              },
            ]}>
            <View style={styles.chapterModalHeader}>
              <AppText role="titleMediumEmphasized" style={{color: '#FFFFFF'}}>
                Chapters ({allChapters.length})
              </AppText>
              <TouchableOpacity onPress={() => setChapterModalVisible(false)}>
                <MaterialCommunityIcons
                  name="close"
                  size={20}
                  color="rgba(255, 255, 255, 0.7)"
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
                        backgroundColor: 'rgba(124, 77, 255, 0.18)',
                        borderColor: 'rgba(124, 77, 255, 0.35)',
                        borderWidth: 1,
                      },
                    ]}>
                    <MaterialCommunityIcons
                      name={isSelected ? 'bookmark-check' : 'bookmark-outline'}
                      size={18}
                      color={isSelected ? '#7C4DFF' : 'rgba(255, 255, 255, 0.5)'}
                    />
                    <AppText
                      numberOfLines={1}
                      role={isSelected ? 'bodyMediumEmphasized' : 'bodyMedium'}
                      style={{
                        color: isSelected ? '#7C4DFF' : '#FFFFFF',
                        flex: 1,
                      }}>
                      {ch.title || `Chapter ${idx + 1}`}
                    </AppText>
                    {isSelected && (
                      <View style={styles.readingBadge}>
                        <AppText role="labelSmall" style={styles.readingBadgeText}>
                          READING
                        </AppText>
                      </View>
                    )}
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
    backgroundColor: 'rgba(10, 10, 14, 0.92)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
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
    marginHorizontal: 10,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readingModePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  translatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  incognitoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  incognitoPillActive: {
    backgroundColor: 'rgba(224, 64, 251, 0.22)',
    borderColor: '#E040FB',
  },
  incognitoPillText: {
    color: '#E040FB',
    fontWeight: '800',
    fontSize: 11,
  },
  bottomHud: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 10, 14, 0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingTop: 10,
    zIndex: 20,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    minWidth: 54,
  },
  controlButtonLabel: {
    color: '#FFFFFF',
    fontSize: 11,
  },
  navModeBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.6)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
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
  readingBadge: {
    backgroundColor: '#7C4DFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  readingBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
