import ExternalAppPreference from './components/ExternalAppPreference';
import RNReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {useFocusEffect} from '@react-navigation/native';
import {
  View,
  ToastAndroid,
  BackHandler,
} from 'react-native';
import React, {useState, useCallback} from 'react';
import {settingsStorage} from '../../lib/storage';
import {updateProvidersService} from '../../lib/services/UpdateProviders';
import {autoDomainResolver} from '../../lib/network/autoDomainResolver';
import Constants from 'expo-constants';
import DownloadLocationPreference from './components/DownloadLocationPreference';
import useNavigationPreferencesStore from '../../lib/zustand/navigationPreferencesStore';
import DownloadConcurrencyPreference from './components/DownloadConcurrencyPreference';
import VerificationWindowPreference from './components/VerificationWindowPreference';
import AppText from '../../components/ui/Text';
import SettingsSection from '../../components/ui/SettingsSection';
import SettingsPage from '../../components/ui/SettingsPage';
import SettingsRow from '../../components/ui/SettingsRow';
import SettingsSwitchRow from '../../components/ui/SettingsSwitchRow';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {TVFocusable, TVFocusGuide} from '../../components/tv';
import {isTV} from '../../lib/tv';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import LoadingIndicator from '../../components/ui/LoadingIndicator';
import {
  getAnalytics,
  getCrashlytics,
  isFirebaseNativeReady,
} from '../../lib/utils/firebaseSafe';

const applyTelemetryOptIn = async (next: boolean) => {
  try {
    const crashlytics = getCrashlytics();
    crashlytics && (await crashlytics().setCrashlyticsCollectionEnabled(next));
  } catch {}
  try {
    const analytics = getAnalytics();
    analytics && (await analytics().setAnalyticsCollectionEnabled(next));
    analytics &&
      (await analytics().setConsent({
        analytics_storage: next,
        ad_storage: next,
        ad_user_data: next,
        ad_personalization: next,
      }));
  } catch {}
};

const Preferences = ({navigation}: any) => {
  const hasFirebase =
    Boolean(Constants?.expoConfig?.extra?.hasFirebase) &&
    isFirebaseNativeReady();
  const colors = useM3Colors();

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

  const [disableDrawer, setDisableDrawer] = useState(
    () => settingsStorage.getBool('disableDrawer') || false,
  );

  const [showHamburgerMenu, setShowHamburgerMenu] = useState<boolean>(() =>
    settingsStorage.showHamburgerMenu(),
  );

  const [showTabBarLables, setShowTabBarLables] = useState<boolean>(() =>
    settingsStorage.showTabBarLabels(),
  );
  const hideDownloadsTab = useNavigationPreferencesStore(
    state => state.hideDownloadsTab,
  );
  const setHideDownloadsTab = useNavigationPreferencesStore(
    state => state.setHideDownloadsTab,
  );
  const showContinueWatching = useNavigationPreferencesStore(
    state => state.showContinueWatching,
  );
  const setShowContinueWatching = useNavigationPreferencesStore(
    state => state.setShowContinueWatching,
  );

  const [hapticFeedback, setHapticFeedback] = useState(() =>
    settingsStorage.isHapticFeedbackEnabled(),
  );
  const [providerAutoUpdates, setProviderAutoUpdates] = useState(() =>
    settingsStorage.isProviderAutoUpdateEnabled(),
  );

  const [autoDomainResolverEnabled, setAutoDomainResolverEnabled] = useState(() =>
    settingsStorage.isAutoDomainResolverEnabled(),
  );
  const [singleRoomCollectorEnabled, setSingleRoomCollectorEnabled] = useState(() =>
    settingsStorage.isSingleRoomCollectorEnabled(),
  );
  const [hideDuplicates, setHideDuplicates] = useState(() =>
    settingsStorage.isHideDuplicatePosts(),
  );
  const [refreshingDomains, setRefreshingDomains] = useState(false);

  const [alwaysUseExternalDownload, setAlwaysUseExternalDownload] = useState(
    () => settingsStorage.getBool('alwaysExternalDownloader') || false,
  );

  const [skipInAppWebview, setSkipInAppWebview] = useState<boolean>(() =>
    settingsStorage.isSkipInAppWebview(),
  );

  const [telemetryOptIn, setTelemetryOptIn] = useState<boolean>(() =>
    settingsStorage.isTelemetryOptIn(),
  );

  const handleRefreshDomains = useCallback(async () => {
    setRefreshingDomains(true);
    try {
      const count = await autoDomainResolver.refreshWorkingDomains();
      ToastAndroid.show(
        `Domains refreshed (${count} active mirrors mapped)`,
        ToastAndroid.SHORT,
      );
    } catch {
      ToastAndroid.show('Domain mirror check complete', ToastAndroid.SHORT);
    } finally {
      setRefreshingDomains(false);
    }
  }, []);

  return (
    <TVFocusGuide
      autoFocus={true}
      trapFocusRight={true}
      trapFocusDown={true}
      style={{flex: 1}}>
      <SettingsPage>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 12,
          }}>
          <TVFocusable
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
            Preferences
          </AppText>
        </View>
        <AppText
          role="bodyLarge"
          className="mb-7 mt-1 text-m3-on-surface-variant">
          Manage comic providers, domain resolvers, and experience
        </AppText>

        <SettingsSection title="Providers & Resolvers">
          <SettingsSwitchRow
            title="Auto update providers"
            description="Install provider updates automatically. Turn off to review and install updates manually in Extensions."
            value={providerAutoUpdates}
            onValueChange={next => {
              settingsStorage.setProviderAutoUpdateEnabled(next);
              setProviderAutoUpdates(next);
              if (next) {
                void updateProvidersService
                  .checkForUpdatesAndAutoUpdate()
                  .catch(error => console.warn('Provider update check failed:', error));
              }
            }}
          />
          <SettingsSwitchRow
            title="Auto-TLD Domain Resolver"
            description="Automatically recover dead or blocked provider domains using dynamic mirrors"
            value={autoDomainResolverEnabled}
            onValueChange={next => {
              settingsStorage.setAutoDomainResolverEnabled(next);
              setAutoDomainResolverEnabled(next);
            }}
          />
          <SettingsRow
            title="Refresh Working Domains Now"
            description="Probe and update live mirror addresses from domains.json registry"
            icon="web-sync"
            trailing={refreshingDomains ? <LoadingIndicator size={14} /> : undefined}
            onPress={refreshingDomains ? undefined : handleRefreshDomains}
          />
          <SettingsSwitchRow
            title="Single-Room Series Collector"
            description="Group multi-chapter and duplicate provider releases under a single series card"
            value={singleRoomCollectorEnabled}
            onValueChange={next => {
              settingsStorage.setSingleRoomCollectorEnabled(next);
              setSingleRoomCollectorEnabled(next);
            }}
          />
          <SettingsSwitchRow
            title="Hide Duplicate Releases"
            description="Filter identical comic titles across feeds and search results"
            value={hideDuplicates}
            onValueChange={next => {
              settingsStorage.setHideDuplicatePosts(next);
              setHideDuplicates(next);
            }}
          />
          <VerificationWindowPreference />
        </SettingsSection>

        <SettingsSection title="Experience">
          <SettingsSwitchRow
            title="Haptic feedback"
            description="Use subtle vibration for actions and selections"
            value={hapticFeedback}
            onValueChange={next => {
              settingsStorage.setHapticFeedbackEnabled(next);
              setHapticFeedback(next);
            }}
          />
          <SettingsSwitchRow
            title="Tab bar labels"
            description="Show destination names below navigation icons"
            value={showTabBarLables}
            onValueChange={next => {
              settingsStorage.setShowTabBarLabels(next);
              setShowTabBarLables(next);
              ToastAndroid.show(
                'Restart App to Apply Changes',
                ToastAndroid.SHORT,
              );
            }}
          />
          <SettingsSwitchRow
            title="Hide downloads tab"
            value={hideDownloadsTab}
            onValueChange={setHideDownloadsTab}
          />
          <SettingsSwitchRow
            title="Hamburger menu"
            value={showHamburgerMenu}
            onValueChange={next => {
              settingsStorage.setShowHamburgerMenu(next);
              setShowHamburgerMenu(next);
            }}
          />
          <SettingsSwitchRow
            title="Continue reading"
            description="Show the Continue reading row on Home. Chapter reading positions are still saved."
            value={showContinueWatching}
            onValueChange={setShowContinueWatching}
          />
          <SettingsSwitchRow
            title="Disable drawer"
            value={disableDrawer}
            onValueChange={next => {
              settingsStorage.setBool('disableDrawer', next);
              setDisableDrawer(next);
            }}
          />
          <SettingsSwitchRow
            title="External downloader"
            description="Send comic downloads to another app"
            value={alwaysUseExternalDownload}
            onValueChange={next => {
              settingsStorage.setBool('alwaysExternalDownloader', next);
              setAlwaysUseExternalDownload(next);
            }}
          />
          <ExternalAppPreference kind="downloader" />
          <SettingsSwitchRow
            title="Skip in-app webview"
            description="Open external web links directly in your default browser"
            value={skipInAppWebview}
            divider={!isTV}
            onValueChange={next => {
              settingsStorage.setSkipInAppWebview(next);
              setSkipInAppWebview(next);
            }}
          />
        </SettingsSection>

        {hasFirebase ? (
          <SettingsSection title="Privacy">
            <SettingsSwitchRow
              title="Usage and crash reports"
              description="Help improve Vega Komix with anonymous diagnostics"
              value={telemetryOptIn}
              divider={false}
              onValueChange={async next => {
                setTelemetryOptIn(next);
                settingsStorage.setTelemetryOptIn(next);
                await applyTelemetryOptIn(next);
              }}
            />
          </SettingsSection>
        ) : null}

        <DownloadLocationPreference primary={colors.primary} />

        <DownloadConcurrencyPreference primary={colors.primary} />
      </SettingsPage>
    </TVFocusGuide>
  );
};

export default Preferences;
