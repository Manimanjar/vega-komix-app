import React, {useCallback, useMemo, useState} from 'react';
import {
  Clipboard,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from '../ui/Text';
import type {TranslatedBubble} from '../../lib/translator/mangaTranslatorEngine';

export interface TranslatedBubbleOverlayProps {
  bubbles: TranslatedBubble[];
  renderedWidth: number;
  renderedHeight: number;
  visible?: boolean;
  onRetryBubble?: (bubble: TranslatedBubble) => void;
}

interface SingleBubbleProps {
  bubble: TranslatedBubble;
  renderedWidth: number;
  renderedHeight: number;
  onPress: (bubble: TranslatedBubble) => void;
}

const SingleBubbleView = React.memo<SingleBubbleProps>(({
  bubble,
  renderedWidth,
  renderedHeight,
  onPress,
}) => {
  const left = bubble.box.xRatio * renderedWidth;
  const top = bubble.box.yRatio * renderedHeight;
  const width = Math.max(bubble.box.wRatio * renderedWidth, 38);
  const height = Math.max(bubble.box.hRatio * renderedHeight, 22);

  // Dynamic font sizing based on speech bubble area vs character count
  const fontSize = useMemo(() => {
    const area = width * height;
    const charCount = Math.max(bubble.translatedText.length, 1);
    // Approximate ideal font size to prevent overflow
    const estimated = Math.floor(Math.sqrt((area * 0.65) / (charCount * 0.75)));
    return Math.min(Math.max(estimated, 8), 15);
  }, [width, height, bubble.translatedText]);

  const lineHeight = Math.round(fontSize * 1.25);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(bubble)}
      style={[
        styles.speechBubble,
        {
          left,
          top,
          width,
          height,
        },
      ]}>
      <AppText
        role="labelSmall"
        style={[
          styles.bubbleText,
          {
            fontSize,
            lineHeight,
          },
        ]}>
        {bubble.translatedText}
      </AppText>
    </TouchableOpacity>
  );
});

export const TranslatedBubbleOverlay: React.FC<TranslatedBubbleOverlayProps> = React.memo(({
  bubbles,
  renderedWidth,
  renderedHeight,
  visible = true,
  onRetryBubble,
}) => {
  const [selectedBubble, setSelectedBubble] = useState<TranslatedBubble | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleBubblePress = useCallback((bubble: TranslatedBubble) => {
    setSelectedBubble(bubble);
    setCopiedText(null);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedBubble(null);
    setCopiedText(null);
  }, []);

  const handleCopyText = useCallback((text: string) => {
    try {
      Clipboard.setString(text);
      setCopiedText('Copied!');
      setTimeout(() => setCopiedText(null), 2000);
    } catch {}
  }, []);

  if (!visible || !bubbles || bubbles.length === 0 || renderedWidth <= 0 || renderedHeight <= 0) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {bubbles.map(bubble => (
        <SingleBubbleView
          key={bubble.id}
          bubble={bubble}
          renderedWidth={renderedWidth}
          renderedHeight={renderedHeight}
          onPress={handleBubblePress}
        />
      ))}

      {/* Interactive floating pill popover for inspecting raw text / retry */}
      {selectedBubble && (
        <Modal
          transparent
          animationType="fade"
          visible={true}
          onRequestClose={handleCloseModal}>
          <Pressable style={styles.modalBackdrop} onPress={handleCloseModal}>
            <Pressable style={styles.tooltipPill} onPress={e => e.stopPropagation()}>
              <View style={styles.tooltipHeader}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                  <MaterialCommunityIcons name="translate" size={16} color="#B388FF" />
                  <AppText role="labelMedium" style={{color: '#B388FF', fontWeight: '800'}}>
                    Speech Bubble Inspector
                  </AppText>
                </View>
                <TouchableOpacity onPress={handleCloseModal} style={styles.closeBtn}>
                  <MaterialCommunityIcons name="close" size={16} color="#A1A1AA" />
                </TouchableOpacity>
              </View>

              {/* Raw Source Text */}
              <View style={styles.textSection}>
                <AppText role="labelSmall" style={styles.sectionLabel}>
                  RAW SOURCE
                </AppText>
                <AppText role="bodyMedium" style={styles.rawText}>
                  {selectedBubble.originalText}
                </AppText>
              </View>

              {/* Translated Text */}
              <View style={styles.textSection}>
                <AppText role="labelSmall" style={styles.sectionLabel}>
                  UNCENSORED ENGLISH
                </AppText>
                <AppText role="bodyMedium" style={styles.translatedFullText}>
                  {selectedBubble.translatedText}
                </AppText>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleCopyText(selectedBubble.translatedText)}>
                  <MaterialCommunityIcons
                    name={copiedText ? 'check' : 'content-copy'}
                    size={14}
                    color="#FFFFFF"
                  />
                  <AppText role="labelSmall" style={{color: '#FFFFFF', fontWeight: '700'}}>
                    {copiedText || 'Copy Text'}
                  </AppText>
                </TouchableOpacity>

                {onRetryBubble && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.retryBtn]}
                    onPress={() => {
                      onRetryBubble(selectedBubble);
                      handleCloseModal();
                    }}>
                    <MaterialCommunityIcons name="refresh" size={14} color="#FFD600" />
                    <AppText role="labelSmall" style={{color: '#FFD600', fontWeight: '700'}}>
                      Retry
                    </AppText>
                  </TouchableOpacity>
                )}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  speechBubble: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderColor: '#18181B',
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  bubbleText: {
    color: '#0A0A0A',
    fontWeight: '800',
    textAlign: 'center',
    textAlignVertical: 'center',
    letterSpacing: -0.2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  tooltipPill: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1E1E24',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(124, 77, 255, 0.35)',
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  tooltipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  closeBtn: {
    padding: 4,
  },
  textSection: {
    marginBottom: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    padding: 8,
  },
  sectionLabel: {
    color: '#71717A',
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 2,
  },
  rawText: {
    color: '#E4E4E7',
    fontSize: 13,
  },
  translatedFullText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  retryBtn: {
    backgroundColor: 'rgba(255, 214, 0, 0.12)',
    borderColor: 'rgba(255, 214, 0, 0.3)',
    borderWidth: 1,
  },
});
