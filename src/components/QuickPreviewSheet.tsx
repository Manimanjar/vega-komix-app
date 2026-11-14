import React, {useEffect, useState} from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {Image as ExpoImage} from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import ComicThumbnail from './ComicThumbnail';
import AppText from './ui/Text';
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import {useM3Colors} from '../theme/M3PaletteContext';
import type {Info, Post} from '../lib/providers/types';
import {speculativePreviewEngine} from '../lib/cache/speculativePreviewEngine';

interface QuickPreviewSheetProps {
  visible: boolean;
  post: Post | null;
  providerValue?: string;
  onClose: () => void;
  onReadNow: (post: Post) => void;
  onTagPress?: (tag: string) => void;
  onOpenDetails?: (post: Post) => void;
}

export const QuickPreviewSheet: React.FC<QuickPreviewSheetProps> = ({
  visible,
  post,
  providerValue = '',
  onClose,
  onReadNow,
  onTagPress,
  onOpenDetails,
}) => {
  const colors = useM3Colors();
  const [details, setDetails] = useState<Info | undefined>(undefined);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  useEffect(() => {
    if (!visible || !post?.link) {
      setDetails(undefined);
      return;
    }

    const effectiveProvider = post.provider || providerValue;
    const cached = speculativePreviewEngine.getPrefetchedMeta(
      post.link,
      effectiveProvider,
    );
    if (cached) {
      setDetails(cached);
      return;
    }

    setLoadingDetails(true);
    speculativePreviewEngine
      .prefetchMeta(post.link, effectiveProvider)
      .then(res => {
        if (res) setDetails(res);
      })
      .finally(() => setLoadingDetails(false));
  }, [visible, post?.link, post?.provider, providerValue]);

  if (!visible || !post) return null;

  const displayTitle = details?.title || post.title || 'Comic Preview';
  const displayImage = details?.image || post.image;
  const displaySynopsis =
    details?.synopsis ||
    (post as any).synopsis ||
    'No synopsis available for this title.';
  const displayStatus =
    details?.status ||
    (post as any).status ||
    ((post as any).type === 'doujinshi' ? 'One-Shot' : 'Ongoing');
  const contentType = (post as any).type || (post as any).contentType || post.tag || 'Manga';
  const effectiveProvider = post.provider || providerValue || 'Unknown';

  // Extract tags from details or post
  const rawTags: string[] =
    details?.tags ||
    (details?.genres as string[]) ||
    (post as any).tags ||
    (post.tag ? [post.tag] : []);
  const tags = Array.from(new Set(rawTags.filter(Boolean)));

  // Count chapters if available
  const chapterCount = details?.linkList?.length || (details as any)?.chapters?.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheetContainer,
            {
              backgroundColor: colors.surfaceContainerHigh || '#1E1E24',
              borderColor: colors.outlineVariant || '#333',
            },
          ]}
          onPress={e => e.stopPropagation()}>
          {/* Top Grabber */}
          <View style={styles.grabberRow}>
            <View
              style={[
                styles.grabber,
                {backgroundColor: colors.outlineVariant || '#555'},
              ]}
            />
            <View style={styles.closeBtn}>
              <IconButton
                icon="close"
                label="Close preview"
                size={20}
                onPress={onClose}
              />
            </View>
          </View>

          {/* Header Row: 2:3 High-Res Poster + Info */}
          <View style={styles.headerRow}>
            <View style={styles.posterWrapper}>
              <ComicThumbnail
                source={displayImage}
                style={styles.poster}
                borderRadius={14}
                altTitle={displayTitle}
                contentFit="cover"
              />
              {contentType ? (
                <View style={styles.typeBadge}>
                  <AppText style={styles.typeBadgeText}>
                    {contentType.toUpperCase()}
                  </AppText>
                </View>
              ) : null}
            </View>

            <View style={styles.infoCol}>
              <AppText
                role="titleLargeEmphasized"
                numberOfLines={2}
                style={{color: colors.onSurface, fontSize: 18, lineHeight: 24}}>
                {displayTitle}
              </AppText>

              <View style={styles.pillRow}>
                {displayStatus ? (
                  <View
                    style={[
                      styles.pill,
                      {
                        backgroundColor:
                          displayStatus.toLowerCase() === 'completed'
                            ? 'rgba(76, 175, 80, 0.2)'
                            : 'rgba(33, 150, 243, 0.2)',
                      },
                    ]}
                  >
                    <AppText
                      style={[
                        styles.pillText,
                        {
                          color:
                            displayStatus.toLowerCase() === 'completed'
                              ? '#81C784'
                              : '#64B5F6',
                        },
                      ]}
                    >
                      {displayStatus}
                    </AppText>
                  </View>
                ) : null}

                {effectiveProvider ? (
                  <View
                    style={[
                      styles.pill,
                      {backgroundColor: 'rgba(255, 255, 255, 0.08)'},
                    ]}
                  >
                    <AppText style={[styles.pillText, {color: colors.onSurfaceVariant}]}>
                      {effectiveProvider}
                    </AppText>
                  </View>
                ) : null}

                {chapterCount ? (
                  <View
                    style={[
                      styles.pill,
                      {backgroundColor: colors.primaryContainer},
                    ]}
                  >
                    <AppText
                      style={[
                        styles.pillText,
                        {color: colors.onPrimaryContainer, fontWeight: '700'},
                      ]}
                    >
                      {chapterCount} Ch.
                    </AppText>
                  </View>
                ) : null}
              </View>

              {/* Action Buttons */}
              <View style={styles.headerActionRow}>
                <Button
                  variant="filled"
                  onPress={() => {
                    onClose();
                    onReadNow(post);
                  }}
                  style={styles.readNowBtn}
                >
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                    <MaterialCommunityIcons
                      name="book-open-page-variant"
                      size={18}
                      color={colors.onPrimary}
                    />
                    <AppText
                      role="labelLargeEmphasized"
                      style={{color: colors.onPrimary}}>
                      Read Now
                    </AppText>
                  </View>
                </Button>
                {onOpenDetails ? (
                  <Button
                    variant="tonal"
                    onPress={() => {
                      onClose();
                      onOpenDetails(post);
                    }}
                  >
                    Details
                  </Button>
                ) : null}
              </View>
            </View>
          </View>

          {/* Tags Pills Row */}
          {tags.length > 0 ? (
            <View style={styles.tagsSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tagScroll}>
                {tags.map((tag, idx) => (
                  <TouchableOpacity
                    key={`${tag}-${idx}`}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (onTagPress) {
                        onClose();
                        onTagPress(tag);
                      }
                    }}
                    style={[
                      styles.tagBadge,
                      {backgroundColor: colors.surfaceContainerHighest || '#2A2A32'},
                    ]}
                  >
                    <AppText
                      style={[styles.tagText, {color: colors.onSurfaceVariant}]}>
                      #{tag}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Synopsis section */}
          <View style={styles.synopsisContainer}>
            <AppText role="labelLarge" style={{color: colors.outline, marginBottom: 4}}>
              SYNOPSIS
            </AppText>
            <ScrollView
              style={styles.synopsisScroll}
              showsVerticalScrollIndicator={false}>
              <AppText
                style={{
                  color: colors.onSurfaceVariant,
                  fontSize: 13.5,
                  lineHeight: 20,
                }}>
                {displaySynopsis}
              </AppText>
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: '80%',
    elevation: 24,
  },
  grabberRow: {
    alignItems: 'center',
    paddingVertical: 10,
    position: 'relative',
  },
  grabber: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
  },
  closeBtn: {
    position: 'absolute',
    right: 0,
    top: 2,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  posterWrapper: {
    width: 110,
    height: 165,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#111',
    elevation: 4,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  typeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  typeBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  infoCol: {
    flex: 1,
    justifyContent: 'space-between',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 6,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  readNowBtn: {
    flex: 1,
  },
  tagsSection: {
    marginTop: 14,
  },
  tagScroll: {
    gap: 8,
  },
  tagBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  synopsisContainer: {
    marginTop: 14,
    maxHeight: 120,
  },
  synopsisScroll: {
    maxHeight: 100,
  },
});
