import React from 'react';
import {StyleSheet, TouchableOpacity, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from '../ui/Text';
import type {ReaderTheme} from './types';
import {THEME_COLORS} from './types';

export interface EndOfChapterCardProps {
  hasNextChapter: boolean;
  nextChapterTitle?: string;
  onNextChapter?: () => void;
  theme?: ReaderTheme;
  isPaged?: boolean;
}

export const EndOfChapterCard: React.FC<EndOfChapterCardProps> = ({
  hasNextChapter,
  nextChapterTitle,
  onNextChapter,
  theme = 'amoled',
  isPaged = false,
}) => {
  const themeColors = THEME_COLORS[theme];
  const isSepia = theme === 'sepia';
  const isWhite = theme === 'white';

  // This card is the next-chapter navigation at the end of a chapter. The
  // old "You've caught up!" variant was removed: it flashed into view on
  // every far slider jump and served no navigation purpose.
  if (!hasNextChapter) {
    return null;
  }

  const cardBg = isSepia
    ? '#F0E2C8'
    : isWhite
    ? '#F4F4F5'
    : theme === 'dark'
    ? '#1E1E24'
    : '#121216';

  const borderColor = isSepia
    ? 'rgba(67, 52, 34, 0.15)'
    : isWhite
    ? 'rgba(0, 0, 0, 0.08)'
    : 'rgba(255, 255, 255, 0.08)';

  const primaryTextColor = isSepia ? '#433422' : isWhite ? '#1A1A1A' : '#FFFFFF';
  const secondaryTextColor = isSepia
    ? '#755C41'
    : isWhite
    ? '#666666'
    : 'rgba(255, 255, 255, 0.65)';

  return (
    <View
      style={[
        styles.outerContainer,
        isPaged && styles.pagedOuterContainer,
        {backgroundColor: themeColors.background},
      ]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor,
          },
        ]}>
        <View style={styles.badgeRow}>
          <View style={styles.endPill}>
            <AppText role="labelSmall" style={styles.endPillText}>
              END OF CHAPTER
            </AppText>
          </View>
        </View>

        <View style={styles.iconCircle}>
          <MaterialCommunityIcons
            name="book-open-page-variant-outline"
            size={36}
            color="#7C4DFF"
          />
        </View>

        <AppText
          role="titleMediumEmphasized"
          numberOfLines={2}
          style={[styles.nextTitle, {color: primaryTextColor}]}>
          {nextChapterTitle || 'Next Chapter'}
        </AppText>

        <AppText role="bodySmall" style={[styles.hintText, {color: secondaryTextColor}]}>
          {isPaged
            ? 'Swipe or tap below to start reading the next chapter'
            : 'Swipe up or tap below to advance to the next chapter'}
        </AppText>

        {onNextChapter && (
          <TouchableOpacity
            onPress={onNextChapter}
            activeOpacity={0.8}
            style={styles.advanceButton}>
            <AppText role="labelLargeEmphasized" style={styles.advanceButtonText}>
              Read Next Chapter
            </AppText>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    width: '100%',
    paddingVertical: 48,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagedOuterContainer: {
    flex: 1,
    height: '100%',
    paddingVertical: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  badgeRow: {
    marginBottom: 16,
  },
  endPill: {
    backgroundColor: 'rgba(124, 77, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(124, 77, 255, 0.3)',
  },
  endPillText: {
    color: '#7C4DFF',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(124, 77, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  nextTitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  hintText: {
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
    maxWidth: 320,
  },
  advanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C4DFF',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    shadowColor: '#7C4DFF',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  advanceButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    marginRight: 8,
    fontSize: 15,
  },
});
