import React, { useEffect, useState, useRef } from 'react';
import { View, TouchableOpacity, ToastAndroid, Pressable, UIManager, findNodeHandle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Octicons from '@expo/vector-icons/Octicons';
import Svg, { Circle, Path } from 'react-native-svg';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import useContentStore from '../lib/zustand/contentStore';
import LoadingIndicator from './ui/LoadingIndicator';
import { settingsStorage } from '../lib/storage';
import { useTVFocusBorderColor } from '../lib/tv/useTVFocusBorderColor';
import { isTV } from '../lib/tv';
import { TVFocusable } from './tv';
import { findEpisodeDownload } from '../lib/downloadLibrary';
import useDownloadsStore, {
  CURRENT_DOWNLOAD_STATUSES,
} from '../lib/zustand/downloadsStore';
import { useM3Colors } from '../theme/M3PaletteContext';
import { LEGACY_TERTIARY_BACKGROUND } from '../theme/seeds';
import { showAppDialog } from '../lib/zustand/appDialogStore';
import { formatDownloadProgressLabel } from '../lib/downloadFormatting';
import {
  startComicChapterDownload,
  pauseComicChapterDownload,
  resumeComicChapterDownload,
  cancelComicChapterDownload,
  deleteComicChapterDownload,
  exportChapterToCbz,
} from '../lib/comicDownloader';
import { ifExists } from '../lib/file/ifExists';

const DOWNLOAD_PROGRESS_SIZE = 42;
const DOWNLOAD_PROGRESS_RADIUS = 18;
const DOWNLOAD_PROGRESS_CENTER = DOWNLOAD_PROGRESS_SIZE / 2;

const createProgressPiePath = (progress: number) => {
  if (progress <= 0 || progress >= 1) {
    return undefined;
  }
  const endAngle = progress * Math.PI * 2 - Math.PI / 2;
  const endX =
    DOWNLOAD_PROGRESS_CENTER + DOWNLOAD_PROGRESS_RADIUS * Math.cos(endAngle);
  const endY =
    DOWNLOAD_PROGRESS_CENTER + DOWNLOAD_PROGRESS_RADIUS * Math.sin(endAngle);
  const largeArcFlag = progress > 0.5 ? 1 : 0;

  return [
    `M ${DOWNLOAD_PROGRESS_CENTER} ${DOWNLOAD_PROGRESS_CENTER}`,
    `L ${DOWNLOAD_PROGRESS_CENTER} ${
      DOWNLOAD_PROGRESS_CENTER - DOWNLOAD_PROGRESS_RADIUS
    }`,
    `A ${DOWNLOAD_PROGRESS_RADIUS} ${DOWNLOAD_PROGRESS_RADIUS} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
    'Z',
  ].join(' ');
};

const DownloadProgress = ({
  downloadedBytes,
  totalBytes,
  color,
}: {
  downloadedBytes: number;
  totalBytes: number;
  color: string;
}) => {
  const hasKnownTotal = totalBytes > 0;
  const progress = hasKnownTotal
    ? Math.min(1, Math.max(0, downloadedBytes / totalBytes))
    : 0;
  const progressPath = createProgressPiePath(progress);

  return (
    <View
      style={{
        alignItems: 'center',
        height: DOWNLOAD_PROGRESS_SIZE,
        justifyContent: 'center',
        width: DOWNLOAD_PROGRESS_SIZE,
      }}>
      <Svg
        height={DOWNLOAD_PROGRESS_SIZE}
        width={DOWNLOAD_PROGRESS_SIZE}
        style={{ position: 'absolute' }}>
        <Circle
          cx={DOWNLOAD_PROGRESS_CENTER}
          cy={DOWNLOAD_PROGRESS_CENTER}
          r={DOWNLOAD_PROGRESS_RADIUS}
          fill="rgba(255,255,255,0.16)"
        />
        {progress >= 1 ? (
          <Circle
            cx={DOWNLOAD_PROGRESS_CENTER}
            cy={DOWNLOAD_PROGRESS_CENTER}
            r={DOWNLOAD_PROGRESS_RADIUS}
            fill={color}
          />
        ) : progressPath ? (
          <Path d={progressPath} fill={color} />
        ) : null}
      </Svg>
      {!hasKnownTotal ? (
        <MaterialIcons name="downloading" size={24} color={color} />
      ) : null}
    </View>
  );
};

export interface DownloaderProps {
  link: string;
  downloadId: string;
  fileName?: string;
  type?: string;
  mediaType?: 'movie' | 'series';
  providerValue: string;
  title: string;
  showName?: string;
  episodeName?: string;
  seasonTitle?: string;
  episodeIndex?: number;
  imdbId?: string;
  poster?: string;
  background?: string;
  synopsis?: string;
  infoUrl?: string;
  quickDownload?: boolean;
  skip?: any[];
}

const DownloadComponent = ({
  link,
  downloadId,
  fileName,
  type = 'series',
  providerValue,
  title,
  showName,
  episodeName,
  seasonTitle,
  episodeIndex,
  poster,
  background,
  synopsis,
  infoUrl,
}: DownloaderProps) => {
  const navigation = useNavigation<any>();
  const colors = useM3Colors();
  const primary = colors.primary;
  const focusBorderColor = useTVFocusBorderColor(primary);
  const provider = useContentStore(state => state.provider);
  const downloadButtonRef = useRef<View>(null);

  const [loading, setLoading] = useState(false);
  const [legacyExists, setLegacyExists] = useState(false);

  const activeDownload = useDownloadsStore(state =>
    findEpisodeDownload(Object.values(state.downloads), {
      downloadId,
      infoUrl,
      link,
      seasonTitle,
      episodeName,
    }),
  );

  const isDownloading = Boolean(
    activeDownload && CURRENT_DOWNLOAD_STATUSES.has(activeDownload.status),
  );
  const isCompleted =
    activeDownload?.status === 'completed' || Boolean(legacyExists);

  useEffect(() => {
    if (activeDownload || !fileName) return;
    let active = true;
    ifExists(fileName).then(exists => {
      if (active) setLegacyExists(Boolean(exists));
    });
    return () => {
      active = false;
    };
  }, [activeDownload, fileName]);

  const showActiveDialog = () => {
    if (!activeDownload) return;
    const isPaused = activeDownload.status === 'paused';
    const progressLabel = formatDownloadProgressLabel(activeDownload);

    showAppDialog({
      title: isPaused ? 'Download Paused' : 'Downloading Chapter',
      message: `${episodeName || title}\nStatus: ${progressLabel}`,
      actions: [
        {
          label: isPaused ? 'Resume Download' : 'Pause Download',
          onPress: async () => {
            if (isPaused) {
              await resumeComicChapterDownload(activeDownload.id);
            } else {
              await pauseComicChapterDownload(activeDownload.id);
            }
          },
        },
        {
          label: 'Cancel Download',
          variant: 'destructive',
          onPress: async () => {
            await cancelComicChapterDownload(activeDownload.id);
          },
        },
        { label: 'Close' },
      ],
    });
  };

  const showCompletedDialog = () => {
    const target = activeDownload;
    const activeId = target?.id || downloadId;
    const filePath = target?.filePath;

    showAppDialog({
      title: episodeName || title,
      message: 'Chapter is downloaded and ready for offline reading.',
      actions: [
        {
          label: 'Read Chapter',
          onPress: () => {
            navigation.navigate('Player', {
              episodeList: [
                {
                  id: activeId,
                  title: episodeName || title,
                  link: filePath || link,
                  sourceLink: link,
                },
              ],
              linkIndex: 0,
              type: 'series',
              directUrl: filePath,
              primaryTitle: showName || title,
              secondaryTitle: seasonTitle,
              poster: { poster, background },
              providerValue: providerValue || provider.value,
              infoUrl,
            });
          },
        },
        {
          label: 'Export as .cbz',
          onPress: async () => {
            if (filePath) {
              try {
                const cbzTarget = filePath.endsWith('.cbz')
                  ? filePath
                  : `${filePath}.cbz`;
                await exportChapterToCbz(filePath, cbzTarget);
                ToastAndroid.show(
                  `Exported to ${cbzTarget.split('/').pop()}`,
                  ToastAndroid.LONG,
                );
              } catch (err: any) {
                ToastAndroid.show(
                  err?.message || 'Export failed',
                  ToastAndroid.SHORT,
                );
              }
            }
          },
        },
        {
          label: 'Delete Download',
          variant: 'destructive',
          onPress: async () => {
            await deleteComicChapterDownload(activeId);
            setLegacyExists(false);
            ToastAndroid.show('Download deleted', ToastAndroid.SHORT);
          },
        },
        { label: 'Cancel' },
      ],
    });
  };

  const handleDownloadPress = async () => {
    if (loading) return;

    if (settingsStorage.isHapticFeedbackEnabled()) {
      ReactNativeHapticFeedback.trigger('effectTick', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });
    }

    if (isDownloading) {
      showActiveDialog();
      return;
    }

    if (isCompleted) {
      showCompletedDialog();
      return;
    }

    // Start parallel chapter image download
    setLoading(true);
    try {
      await startComicChapterDownload({
        downloadId,
        title,
        showName,
        episodeName,
        seasonTitle,
        episodeIndex,
        providerValue: providerValue || provider.value,
        infoUrl,
        sourceLink: link,
        poster,
        background,
        synopsis,
        type: 'series',
      });
    } catch (err: any) {
      ToastAndroid.show(
        err?.message || 'Failed to start download',
        ToastAndroid.SHORT,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      collapsable={false}
      className="h-12 w-12 flex-row items-center justify-center rounded-full"
      style={{ backgroundColor: LEGACY_TERTIARY_BACKGROUND }}>
      {isTV ? (
        <TVFocusable
          ref={downloadButtonRef}
          accessibilityRole="button"
          accessibilityLabel={
            isDownloading
              ? 'Download in progress. Tap to manage.'
              : isCompleted
              ? 'Downloaded chapter. Tap to manage.'
              : 'Download chapter'
          }
          borderRadius={24}
          focusScale={1.15}
          focusBorderColor={focusBorderColor}
          onPress={handleDownloadPress}
          onLongPress={handleDownloadPress}
          style={{
            height: 48,
            width: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {isDownloading ? (
            <DownloadProgress
              downloadedBytes={activeDownload?.downloadedBytes ?? 0}
              totalBytes={activeDownload?.totalBytes ?? 0}
              color={primary}
            />
          ) : loading ? (
            <LoadingIndicator size={28} color={primary} />
          ) : isCompleted ? (
            <MaterialIcons name="check-circle" size={24} color={primary} />
          ) : (
            <Octicons name="download" size={22} color={primary} />
          )}
        </TVFocusable>
      ) : isDownloading ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Download in progress. Tap to manage."
          onPress={showActiveDialog}
          className="h-12 w-12 items-center justify-center">
          <DownloadProgress
            downloadedBytes={activeDownload?.downloadedBytes ?? 0}
            totalBytes={activeDownload?.totalBytes ?? 0}
            color={primary}
          />
        </TouchableOpacity>
      ) : isCompleted ? (
        <TouchableOpacity
          disabled={loading}
          onPress={showCompletedDialog}
          className="h-12 w-12 items-center justify-center">
          {loading ? (
            <LoadingIndicator size={35} color={primary} />
          ) : (
            <MaterialIcons name="check-circle" size={24} color={primary} />
          )}
        </TouchableOpacity>
      ) : (
        <Pressable
          disabled={loading}
          accessibilityRole="button"
          focusable={!loading}
          isTVSelectable={!loading}
          onPress={handleDownloadPress}
          className="h-12 w-12 items-center justify-center">
          {loading ? (
            <LoadingIndicator size={35} color={primary} />
          ) : (
            <Octicons name="download" size={22} color={primary} />
          )}
        </Pressable>
      )}
    </View>
  );
};

export default DownloadComponent;
