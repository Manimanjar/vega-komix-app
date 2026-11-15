import React, {useState, useCallback} from 'react';
import {
  View,
  ToastAndroid,
  BackHandler,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {useFocusEffect} from '@react-navigation/native';
import Constants from 'expo-constants';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import ExternalAppPreference from './components/ExternalAppPreference';
import DownloadLocationPreference from './components/DownloadLocationPreference';
import DownloadConcurrencyPreference from './components/DownloadConcurrencyPreference';
import VerificationWindowPreference from './components/VerificationWindowPreference';
import {settingsStorage} from '../../lib/storage';
import {autoDomainResolver} from '../../lib/network/autoDomainResolver';
import {mangaTranslatorEngine} from '../../lib/translator/mangaTranslatorEngine';
import useNavigationPreferencesStore from '../../lib/zustand/navigationPreferencesStore';
import AppText from '../../components/ui/Text';
import SettingsSection from '../../components/ui/SettingsSection';
import SettingsPage from '../../components/ui/SettingsPage';
import SettingsRow from '../../components/ui/SettingsRow';
import SettingsSwitchRow from '../../components/ui/SettingsSwitchRow';
import DropdownField from '../../components/ui/DropdownField';
import LoadingIndicator from '../../components/ui/LoadingIndicator';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {TVFocusable, TVFocusGuide} from '../../components/tv';
import {isTV} from '../../lib/tv';
import {
  getAnalytics,
  getCrashlytics,
  isFirebaseNativeReady,
} from '../../lib/utils/firebaseSafe';

const SOURCE_LANG_OPTIONS = [
  {key: 'auto', label: 'Auto-Detect (Zero-Key AI)'},
  {key: 'ja', label: 'Japanese (日本語)'},
  {key: 'ko', label: 'Korean (한국어)'},
  {key: 'zh', label: 'Chinese (中文)'},
] as const;

const ENGINE_OPTIONS = [
  {key: 'zeroKeyAuto', label: 'Zero-Key Auto (Uncensored)'},
  {key: 'customLlm', label: 'Custom Endpoint'},
] as const;

const BUBBLE_STYLE_OPTIONS = [
  {key: 'whiteBubble', label: 'White Bubble Mask'},
  {key: 'darkBox', label: 'Dark Box'},
] as const;

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
      if (!isTV) return;
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

  // 1. Comic Aggregator & Domain Settings
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
  const [manifestUrl, setManifestUrl] = useState(() =>
    settingsStorage.getProviderManifestUrl(),
  );
  const [isManifestFocused, setIsManifestFocused] = useState(false);

  // 2. AI Live Translator Settings
  const [liveTranslatorButton, setLiveTranslatorButton] = useState(() =>
    settingsStorage.isLiveTranslatorButtonEnabled(),
  );
  const [sourceLang, setSourceLang] = useState(() =>
    settingsStorage.getTranslationSourceLang(),
  );
  const [engine, setEngine] = useState<'zeroKeyAuto' | 'customLlm'>(() => {
    const e = settingsStorage.getTranslationEngine();
    return e === 'customLlm' ? 'customLlm' : 'zeroKeyAuto';
  });
  const [customLlmUrl, setCustomLlmUrl] = useState(() =>
    settingsStorage.getCustomLlmUrl(),
  );
  const [customLlmKey, setCustomLlmKey] = useState(() =>
    settingsStorage.getCustomLlmApiKey(),
  );
  const [bubbleStyle, setBubbleStyle] = useState<'whiteBubble' | 'darkBox'>(() =>
    settingsStorage.getTranslationBubbleStyle(),
  );
  const [isUrlFocused, setIsUrlFocused] = useState(false);
  const [isKeyFocused, setIsKeyFocused] = useState(false);

  // 3. Experience & Downloads
  const [hapticFeedback, setHapticFeedback] = useState(() =>
    settingsStorage.isHapticFeedbackEnabled(),
  );
  const [showTabBarLabels, setShowTabBarLabels] = useState(() =>
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
  const [alwaysUseExternalDownload, setAlwaysUseExternalDownload] = useState(
    () => settingsStorage.getBool('alwaysExternalDownloader') || false,
  );
  const [skipInAppWebview, setSkipInAppWebview] = useState(() =>
    settingsStorage.isSkipInAppWebview(),
  );
  const [telemetryOptIn, setTelemetryOptIn] = useState(() =>
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

  const handleResetManifest = useCallback(() => {
    const defaultUrl =
      'https://raw.githubusercontent.com/Manimanjar/vega-komix-providers/main/manifest.json';
    settingsStorage.setProviderManifestUrl(defaultUrl);
    setManifestUrl(defaultUrl);
    ToastAndroid.show('Manifest URL reset to default', ToastAndroid.SHORT);
  }, []);

  const handleClearTranslationCache = useCallback(async () => {
    const cleared = await mangaTranslatorEngine.clearAllTranslationCache();
    ToastAndroid.show(
      cleared > 0
        ? `Cleared ${cleared} cached page translations`
        : 'Translation cache is empty',
      ToastAndroid.SHORT,
    );
  }, []);

  return (
    <TVFocusGuide
      autoFocus={true}
      trapFocusRight={true}
      trapFocusDown={true}
      style={{flex: 1}}>
      <SettingsPage>
        {/* Header */}
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
          Aggregator, AI translation, downloads, and app settings
        </AppText>

        {/* 1. Comic Aggregator & Domain Settings */}
        <SettingsSection title="Comic Aggregator & Domain Settings">
          <SettingsSwitchRow
            title="Auto-TLD Domain Resolver"
            description="Automatically recover blocked or moved comic domains using dynamic mirror pool"
            value={autoDomainResolverEnabled}
            onValueChange={next => {
              settingsStorage.setAutoDomainResolverEnabled(next);
              setAutoDomainResolverEnabled(next);
            }}
          />
          <SettingsRow
            title="Scan & Refresh Working Domains"
            description="Probe and update live mirror addresses from domains.json registry"
            icon="web-sync"
            trailing={refreshingDomains ? <LoadingIndicator size={14} /> : undefined}
            onPress={refreshingDomains ? undefined : handleRefreshDomains}
          />
          <SettingsSwitchRow
            title="Single-Room Chapter Collector (Merge Scattered Chapters)"
            description="Consolidate scattered chapters, volumes, and alternate releases into a single series"
            value={singleRoomCollectorEnabled}
            onValueChange={next => {
              settingsStorage.setSingleRoomCollectorEnabled(next);
              setSingleRoomCollectorEnabled(next);
            }}
          />
          <SettingsSwitchRow
            title="De-Duplicate Feed Cards"
            description="Filter identical comic titles across feeds and search results"
            value={hideDuplicates}
            onValueChange={next => {
              settingsStorage.setHideDuplicatePosts(next);
              setHideDuplicates(next);
            }}
          />

          <View style={{paddingHorizontal: 16, paddingVertical: 12}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, marginBottom: 4}}>
              Default Provider Manifest URL
            </AppText>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <TextInput
                value={manifestUrl}
                onChangeText={text => {
                  setManifestUrl(text);
                  settingsStorage.setProviderManifestUrl(text);
                }}
                onFocus={() => setIsManifestFocused(true)}
                onBlur={() => setIsManifestFocused(false)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={{
                  flex: 1,
                  backgroundColor: colors.surfaceContainerHigh,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 12,
                  color: colors.onSurface,
                  borderWidth: isManifestFocused ? 2 : 1,
                  borderColor: isManifestFocused ? colors.primary : colors.outlineVariant,
                }}
              />
              <TouchableOpacity
                onPress={handleResetManifest}
                style={{
                  backgroundColor: colors.secondaryContainer,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}>
                <AppText role="labelMedium" style={{color: colors.onSecondaryContainer, fontWeight: '700'}}>
                  Reset
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
          <VerificationWindowPreference />
        </SettingsSection>

        {/* 2. AI Live Translator Settings */}
        <SettingsSection title="AI Live Translator Settings">
          <SettingsSwitchRow
            title="Enable Live Translator Button [A/文] in Reader"
            description="Display floating [A/文] translation button in the reader HUD"
            value={liveTranslatorButton}
            onValueChange={next => {
              setLiveTranslatorButton(next);
              settingsStorage.setLiveTranslatorButtonEnabled(next);
            }}
          />

          <View style={{paddingHorizontal: 16, paddingVertical: 12}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, marginBottom: 8}}>
              Default Source Language
            </AppText>
            <DropdownField
              options={SOURCE_LANG_OPTIONS}
              value={SOURCE_LANG_OPTIONS.find(o => o.key === sourceLang)}
              getKey={o => o.key}
              getLabel={o => o.label}
              onChange={o => {
                setSourceLang(o.key);
                settingsStorage.setTranslationSourceLang(o.key);
              }}
            />
          </View>

          <View style={{paddingHorizontal: 16, paddingVertical: 12}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, marginBottom: 8}}>
              Translation Engine
            </AppText>
            <DropdownField
              options={ENGINE_OPTIONS}
              value={ENGINE_OPTIONS.find(o => o.key === engine)}
              getKey={o => o.key}
              getLabel={o => o.label}
              onChange={o => {
                setEngine(o.key as any);
                settingsStorage.setTranslationEngine(o.key as any);
              }}
            />
          </View>

          {engine === 'customLlm' && (
            <View style={{paddingHorizontal: 16, paddingVertical: 8}}>
              <AppText role="labelMedium" style={{color: colors.onSurfaceVariant, marginBottom: 4}}>
                Custom LLM Endpoint URL
              </AppText>
              <TextInput
                value={customLlmUrl}
                onChangeText={text => {
                  setCustomLlmUrl(text);
                  settingsStorage.setCustomLlmUrl(text);
                }}
                onFocus={() => setIsUrlFocused(true)}
                onBlur={() => setIsUrlFocused(false)}
                placeholder="https://api.openai.com/v1/chat/completions"
                placeholderTextColor={colors.onSurfaceVariant}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={{
                  backgroundColor: colors.surfaceContainerHigh,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 13,
                  color: colors.onSurface,
                  borderWidth: isUrlFocused ? 2 : 1,
                  borderColor: isUrlFocused ? colors.primary : colors.outlineVariant,
                  marginBottom: 12,
                }}
              />

              <AppText role="labelMedium" style={{color: colors.onSurfaceVariant, marginBottom: 4}}>
                API Key (Bearer Token)
              </AppText>
              <TextInput
                value={customLlmKey}
                onChangeText={text => {
                  setCustomLlmKey(text);
                  settingsStorage.setCustomLlmApiKey(text);
                }}
                onFocus={() => setIsKeyFocused(true)}
                onBlur={() => setIsKeyFocused(false)}
                placeholder="sk-..."
                placeholderTextColor={colors.onSurfaceVariant}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  backgroundColor: colors.surfaceContainerHigh,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 13,
                  color: colors.onSurface,
                  borderWidth: isKeyFocused ? 2 : 1,
                  borderColor: isKeyFocused ? colors.primary : colors.outlineVariant,
                }}
              />
            </View>
          )}

          <View style={{paddingHorizontal: 16, paddingVertical: 12}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, marginBottom: 8}}>
              Speech Bubble Overlay Style
            </AppText>
            <DropdownField
              options={BUBBLE_STYLE_OPTIONS}
              value={BUBBLE_STYLE_OPTIONS.find(o => o.key === bubbleStyle)}
              getKey={o => o.key}
              getLabel={o => o.label}
              onChange={o => {
                setBubbleStyle(o.key as any);
                settingsStorage.setTranslationBubbleStyle(o.key as any);
              }}
            />
          </View>

          <SettingsRow
            title="Clear Translation Cache"
            description="Remove cached speech bubble OCR extractions and translations"
            icon="delete-sweep-outline"
            divider={false}
            onPress={handleClearTranslationCache}
          />
        </SettingsSection>

        {/* 3. Experience & Downloads */}
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
            value={showTabBarLabels}
            onValueChange={next => {
              settingsStorage.setShowTabBarLabels(next);
              setShowTabBarLabels(next);
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
            title="Continue reading"
            description="Show the Continue reading row on Home. Chapter reading positions are still saved."
            value={showContinueWatching}
            onValueChange={setShowContinueWatching}
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
