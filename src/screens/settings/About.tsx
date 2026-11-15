import {useFocusEffect} from '@react-navigation/native';
import {View, ScrollView, ToastAndroid, Linking, BackHandler, findNodeHandle} from 'react-native';
// import pkg from '../../../package.json';
import React, {useState, useEffect, useRef, useCallback} from 'react';
import {settingsStorage} from '../../lib/storage';
import * as RNFS from '@dr.pogodin/react-native-fs';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import {notificationService} from '../../lib/services/Notification';
import SettingsRow from '../../components/ui/SettingsRow';
import SettingsSection from '../../components/ui/SettingsSection';
import SettingsSwitchRow from '../../components/ui/SettingsSwitchRow';
import AppText from '../../components/ui/Text';
import LoadingIndicator from '../../components/ui/LoadingIndicator';
import {showAppDialog} from '../../lib/zustand/appDialogStore';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {TVFocusable, TVFocusGuide} from '../../components/tv';
import {isTV} from '../../lib/tv';
import {
  isDetailedLoggingEnabled,
  setDetailedLogging,
  shareLogs,
  clearLogs,
} from '../../lib/logging/vegaLog';
import {useRemoteStore} from '../../lib/remote/remoteStore';

const deletePartialFile = async (filePath: string) => {
  try {
    if (await RNFS.exists(filePath)) {
      await RNFS.unlink(filePath);
    }
  } catch {}
};

const downloadUpdate = async (url: string, name: string) => {
  console.log('downloading', url, name);
  await notificationService.requestPermission();

  const filePath = `${RNFS.CachesDirectoryPath}/${name}`;

  let expectedSize = 0;

  const {promise} = RNFS.downloadFile({
    fromUrl: url,
    background: true,
    progressInterval: 1000,
    progressDivider: 1,
    toFile: filePath,
    begin: res => {
      expectedSize = res.contentLength;
      console.log('begin', res.jobId, res.statusCode, res.contentLength);
    },
    progress: res => {
      notificationService.showUpdateProgress(
        'Downloading Update',
        `Version ${Application.nativeApplicationVersion} -> ${name}`,
        {
          current: res.bytesWritten,
          max: res.contentLength,
          indeterminate: false,
        },
      );
    },
  });

  try {
    const res = await promise;
    await notificationService.cancelNotification('updateProgress');

    if (res.statusCode !== 200 || res.bytesWritten < expectedSize) {
      console.log(
        `[update] Download failed: status=${res.statusCode}, bytes=${res.bytesWritten}/${expectedSize}`,
      );
      await deletePartialFile(filePath);
      ToastAndroid.show(
        'Download failed, please try again',
        ToastAndroid.SHORT,
      );
      return;
    }

    await notificationService.displayUpdateNotification({
      id: 'downloadComplete',
      title: 'Download Complete',
      body: 'Tap to install',
      data: {filePath, action: 'install'},
    });
  } catch (error) {
    console.log('[update] Download error:', error);
    await notificationService.cancelNotification('updateProgress');
    await deletePartialFile(filePath);
    ToastAndroid.show('Download failed, please try again', ToastAndroid.SHORT);
  }
};

export const CURRENT_VERSION = '6.0.0';
export const RELEASE_DATE = 'November 15, 2026';
export const BUILD_NUMBER = '300';

export const CHANGELOG_CONTENT = `### 🚀 Vega Komix v6.0.0 Release Notes (Nov 15, 2026)

**Build:** 300 | **Target:** Android 6.0+ (ARM64 & Universal)

#### ⚡ 4-Mode Turbo Comic Reader
- **Continuous Webtoon Strip:** Natural aspect-ratio scaling with dynamically computed height. Zero pillarboxing or squishing.
- **Manga (RTL) & Comic (LTR) Pagination:** Native <Pressable> edge tap zones and .runOnJS(true) Reanimated worklets eliminating native crashes.
- **Double-Page Spread:** Side-by-side reading on foldable and tablet devices.
- **AMOLED Dark Background:** True #000000 black canvas for OLED battery savings.

#### 🤖 Zero-Key AI Live Translation
- **Offline OCR:** On-device Japanese & Korean character extraction.
- **Smart Bubble Clustering:** Groups vertical RTL columns and horizontal dialogue into seamless translated speech bubbles.
- **Zero-Key Neural Engine:** Uncensored literary translation without requiring user API keys.

#### 🌐 8 Pre-Configured Providers
- **MangaDex, Komix Gallery, Webtoon & Manhwa, 8Muses, AllPornComic, NovelCrow, ComicsValley, Hentaiser**.
- Dynamic Domain Auto-Resolver with live mirror discovery.

#### 🛡️ Complete Network Bypass Suite
- Cloudflare WARP VPN, ByeDPI anti-censorship engine, DNS over HTTPS (DoH 1.1.1.1), and Cloudflare WAF WebView clearance.

#### 📥 Offline CBZ Downloader
- Multi-chapter parallel image downloading and automatic packing into standard .cbz comic archives.`;

// handle check for update
export const checkForUpdate = async (
  setUpdateLoading: React.Dispatch<React.SetStateAction<boolean>>,
  autoDownload: boolean,
  showToast: boolean = true,
) => {
  setUpdateLoading(true);
  try {
    const res = await fetch(
      'https://api.github.com/repos/Manimanjar/vega-komix-app/releases/latest',
    );
    if (res.status === 403 || res.status === 429) {
      ToastAndroid.show(
        'GitHub API rate limit exceeded. Please wait a few minutes before trying again.',
        ToastAndroid.LONG,
      );
      setUpdateLoading(false);
      return;
    }
    if (!res.ok) {
      throw new Error(`GitHub release check failed with status ${res.status}`);
    }
    const data = await res.json();
    if (!data?.tag_name) {
      throw new Error('Invalid release data received from GitHub');
    }
    const localVersion = Application.nativeApplicationVersion || CURRENT_VERSION;
    const remoteVersion = Number(
      data.tag_name.replace('v', '')?.split('.').join(''),
    );
    if (compareVersions(localVersion || '', data.tag_name.replace('v', ''))) {
      ToastAndroid.show('New update available', ToastAndroid.SHORT);
      showAppDialog({
        title: `Update v${localVersion} -> ${data.tag_name}`,
        message: data.body,
        messageFormat: 'markdown',
        actions: [
          {label: 'Cancel'},
          {
            label: 'Update',
            variant: 'primary',
            onPress: () => {
              const targetKeyword = isTV ? 'tv' : 'mobile';
              const apkAsset =
                data?.assets?.find(
                  (asset: any) =>
                    asset.name?.endsWith('.apk') &&
                    asset.name?.toLowerCase().includes(targetKeyword),
                ) ||
                data?.assets?.find(
                  (asset: any) =>
                    asset.name?.endsWith('.apk') &&
                    asset.name?.toLowerCase().includes('universal'),
                ) ||
                data?.assets?.find((asset: any) =>
                  asset.name?.endsWith('.apk'),
                );
              return autoDownload && apkAsset
                ? downloadUpdate(apkAsset.browser_download_url, apkAsset.name)
                : Linking.openURL(data.html_url);
            },
          },
        ],
      });
      console.log(
        'local version',
        localVersion,
        'remote version',
        remoteVersion,
      );
    } else {
      showToast && ToastAndroid.show('App is up to date', ToastAndroid.SHORT);
      console.log(
        'local version',
        localVersion,
        'remote version',
        remoteVersion,
      );
    }
  } catch (error) {
    const isRateLimit =
      error instanceof Error &&
      error.message.toLowerCase().includes('rate limit');
    const msg = isRateLimit
      ? 'GitHub API rate limit exceeded. Please wait a few minutes before trying again.'
      : 'Failed to check for update';
    ToastAndroid.show(msg, ToastAndroid.SHORT);
    console.log('Update error', error);
  }
  setUpdateLoading(false);
};

const About = ({navigation}: any) => {
  const colors = useM3Colors();
  const backRef = useRef<View>(null);
  const autoDownloadRef = useRef<View>(null);
  const [backHandle, setBackHandle] = useState<number | null>(null);
  const [autoDownloadHandle, setAutoDownloadHandle] = useState<number | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [autoDownload, setAutoDownload] = useState(
    settingsStorage.isAutoDownloadEnabled(),
  );
  const [autoCheckUpdate, setAutoCheckUpdate] = useState<boolean>(
    settingsStorage.isAutoCheckUpdateEnabled(),
  );
  const [detailedLogging, setDetailedLoggingState] = useState(
    isDetailedLoggingEnabled,
  );
  const [exportingLogs, setExportingLogs] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);

  const handleClearLogs = async () => {
    setClearingLogs(true);
    try {
      await clearLogs();
      ToastAndroid.show('Logs cleared', ToastAndroid.SHORT);
    } catch (error: any) {
      ToastAndroid.show(error?.message || 'Could not clear logs', ToastAndroid.SHORT);
    } finally {
      setClearingLogs(false);
    }
  };

  const exportLogs = async () => {
    setExportingLogs(true);
    try {
      const device = useRemoteStore.getState().connectedDevice;
      await shareLogs(
        device
          ? `Receiver ${device.type}: ${[device.manufacturer, device.model, device.name]
              .filter(Boolean)
              .join(' ')}`
          : undefined,
      );
    } catch (error: any) {
      ToastAndroid.show(
        error?.message || 'Could not export logs',
        ToastAndroid.SHORT,
      );
    } finally {
      setExportingLogs(false);
    }
  };

  // Register only while this screen is focused. A hidden screen in a
  // mounted tab or stack must not swallow back presses.
  useFocusEffect(
    useCallback(() => {
      if (!isTV) {
        return;
      }
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (navigation?.canGoBack?.()) {
          navigation.goBack();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [navigation]),
  );

  return (
    <TVFocusGuide autoFocus={true} trapFocusRight={true} trapFocusDown={true} style={{flex: 1}}>
      <ScrollView
        focusable={false}
        accessible={false}
        style={{flex: 1, backgroundColor: colors.background}}
        contentContainerStyle={{padding: 20, paddingBottom: 40}}
        showsVerticalScrollIndicator={false}>
        <View className="mb-7">
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12}}>
            <TVFocusable
              ref={backRef}
              onLayout={() => setBackHandle(findNodeHandle(backRef.current))}
              nextFocusDown={autoDownloadHandle}
              hasTVPreferredFocus={isTV}
              accessibilityLabel="Go back"
              accessibilityRole="button"
              onPress={() => navigation.goBack()}
              borderRadius={22}
              style={{
                alignItems: 'center',
                height: 44,
                justifyContent: 'center',
                marginRight: 10,
                width: 44,
              }}>
              <MaterialCommunityIcons
                name="arrow-left"
                size={28}
                color={colors.onBackground}
              />
            </TVFocusable>
            <AppText
              role="headlineLargeEmphasized"
              className="text-m3-on-background">
              About Vega Komix
            </AppText>
          </View>
          <AppText role="bodyLarge" className="mt-1 text-m3-on-surface-variant">
            The premier zero-latency comic, manga, manhwa & doujinshi reader for Android
          </AppText>
          <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8}}>
            <View
              style={{
                backgroundColor: colors.primaryContainer,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
              }}>
              <AppText
                role="labelSmall"
                style={{color: colors.onPrimaryContainer, fontWeight: '700'}}>
                v{Application.nativeApplicationVersion || CURRENT_VERSION}
              </AppText>
            </View>
            <View
              style={{
                backgroundColor: colors.surfaceContainerHigh,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
              }}>
              <AppText
                role="labelSmall"
                style={{color: colors.onSurfaceVariant}}>
                Updated {RELEASE_DATE}
              </AppText>
            </View>
          </View>
        </View>

        <SettingsSection title="App & Release Information">
          <SettingsRow
            title="App Version"
            description={`Vega Komix v${Application.nativeApplicationVersion || CURRENT_VERSION} (Build ${BUILD_NUMBER})`}
            icon="tag-outline"
          />
          <SettingsRow
            title="Release Date"
            description={RELEASE_DATE}
            icon="calendar-clock-outline"
          />
          <SettingsRow
            title="Build Target"
            description="Android 6.0+ (ARM64 & Universal)"
            icon="android"
          />
          <SettingsRow
            title="What's New in v6.0.0 (Changelog)"
            description="Tap to view complete release notes & changelog"
            icon="clipboard-text-outline"
            divider={Constants.expoConfig?.extra?.isPlayStore}
            onPress={() => {
              showAppDialog({
                title: `Vega Komix v${Application.nativeApplicationVersion || CURRENT_VERSION} Changelog`,
                message: CHANGELOG_CONTENT,
                messageFormat: 'markdown',
                actions: [{label: 'Close', variant: 'primary'}],
              });
            }}
          />

          {!Constants.expoConfig?.extra?.isPlayStore && (
            <>
              <SettingsSwitchRow
                ref={autoDownloadRef}
                nextFocusUp={backHandle}
                title="Auto install updates"
                description="Download and install new releases automatically"
                value={autoDownload}
                onValueChange={next => {
                  setAutoDownload(next);
                  settingsStorage.setAutoDownloadEnabled(next);
                }}
              />
              <SettingsSwitchRow
                title="Check on startup"
                description="Look for a new release when Vega Komix opens"
                value={autoCheckUpdate}
                onValueChange={next => {
                  setAutoCheckUpdate(next);
                  settingsStorage.setAutoCheckUpdateEnabled(next);
                }}
              />
              <SettingsRow
                title="Check for updates"
                description="Compare this build with the latest release"
                icon="update"
                divider={false}
                trailing={
                  updateLoading ? <LoadingIndicator size={14} /> : undefined
                }
                onPress={
                  updateLoading
                    ? undefined
                    : () => checkForUpdate(setUpdateLoading, autoDownload, true)
                }
              />
            </>
          )}
        </SettingsSection>

        <SettingsSection title="Key Features">
          <SettingsRow
            title="Zero-Key AI Live Translation"
            description="Offline & Public OCR speech bubble extraction and auto-translation with spatial clustering"
            icon="translate"
          />
          <SettingsRow
            title="4-Mode Turbo Reader"
            description="Vertical Webtoon, RTL Manga, LTR Comic, and Landscape Double-Page Spread"
            icon="book-open-page-variant"
          />
          <SettingsRow
            title="CBZ Comic Downloader"
            description="High-speed offline chapter archiving in standard .cbz format"
            icon="folder-zip-outline"
          />
          <SettingsRow
            title="Network Bypass Engine"
            description="Built-in Cloudflare WARP, ByeDPI anti-DPI, and DNS over HTTPS"
            icon="shield-check-outline"
          />
          <SettingsRow
            title="Dynamic Domain Auto-Resolver"
            description="Auto-rewrites dead and blocked provider domains using live mirror pools"
            icon="web-sync"
            divider={false}
          />
        </SettingsSection>

        {!isTV && (
          <SettingsSection title="Troubleshooting">
            <SettingsSwitchRow
              title="Detailed logging"
              description="Records more detail for bug reports. Keeps up to 2 MB of logs. Turns off after 24 hours."
              value={detailedLogging}
              onValueChange={next => {
                setDetailedLoggingState(next);
                setDetailedLogging(next);
              }}
            />
            <SettingsRow
              title="Export logs"
              description="Share recent app logs with the developer. Links and sign-in data are removed."
              icon="file-document-outline"
              trailing={
                exportingLogs ? <LoadingIndicator size={14} /> : undefined
              }
              onPress={exportingLogs || clearingLogs ? undefined : exportLogs}
            />
            <SettingsRow
              title="Clear logs"
              description="Clear old logs before reproducing a problem."
              icon="delete-outline"
              divider={false}
              trailing={clearingLogs ? <LoadingIndicator size={14} /> : undefined}
              onPress={clearingLogs || exportingLogs ? undefined : handleClearLogs}
            />
          </SettingsSection>
        )}
      </ScrollView>
    </TVFocusGuide>
  );
};

export default About;

function compareVersions(localVersion: string, remoteVersion: string): boolean {
  try {
    // Split versions into arrays and convert to numbers
    const local = localVersion.split('.').map(Number);
    const remote = remoteVersion.split('.').map(Number);

    // Compare major version
    if (remote[0] > local[0]) {
      return true;
    }
    if (remote[0] < local[0]) {
      return false;
    }

    // Compare minor version
    if (remote[1] > local[1]) {
      return true;
    }
    if (remote[1] < local[1]) {
      return false;
    }

    // Compare patch version
    if (remote[2] > local[2]) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Invalid version format');
    return false;
  }
}
