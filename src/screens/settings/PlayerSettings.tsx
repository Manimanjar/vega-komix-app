import React, {useCallback, useState} from 'react';
import {
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {useFocusEffect} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {SettingsStackParamList} from '../../App';
import {settingsStorage} from '../../lib/storage';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {TVFocusable, TVFocusGuide} from '../../components/tv';
import {isTV} from '../../lib/tv';
import AppText from '../../components/ui/Text';
import SettingsSection from '../../components/ui/SettingsSection';
import SettingsPage from '../../components/ui/SettingsPage';
import SettingsSwitchRow from '../../components/ui/SettingsSwitchRow';
import SettingsRow from '../../components/ui/SettingsRow';
import DropdownField from '../../components/ui/DropdownField';
import {mangaTranslatorEngine} from '../../lib/translator/mangaTranslatorEngine';

type Props = NativeStackScreenProps<SettingsStackParamList, 'PlayerSettings'>;

const READING_MODE_OPTIONS = [
  {key: 'manga', label: 'Right-to-Left (Manga / Doujinshi)'},
  {key: 'webtoon', label: 'Vertical Continuous (Webtoon / Manhwa)'},
  {key: 'comic', label: 'Left-to-Right (Western Comic)'},
  {key: 'double_spread', label: 'Landscape Double-Page Spread'},
] as const;

const PAGE_FIT_OPTIONS = [
  {key: 'fit_width', label: 'Fit Width (Best for Phones)'},
  {key: 'fit_screen', label: 'Fit Screen / Contain (No Crop)'},
  {key: 'fit_height', label: 'Fit Height (Match Height)'},
  {key: 'original', label: 'Original Size (1:1 Resolution)'},
] as const;

const THEME_OPTIONS = [
  {key: 'amoled', label: 'Pure Black (AMOLED / OLED #000)'},
  {key: 'dark', label: 'Dark Gray (#18181B)'},
  {key: 'sepia', label: 'Warm Sepia Paper (#F4ECD8)'},
  {key: 'white', label: 'Clean Light (#FFFFFF)'},
] as const;

const QUALITY_OPTIONS = [
  {key: 'raw', label: 'High Resolution (Raw / Uncompressed)'},
  {key: 'dataSaver', label: 'Data-Saver (Compressed WebP)'},
] as const;

const PRELOAD_OPTIONS = [
  {key: '4', label: '4 Pages Ahead (Low Memory)'},
  {key: '8', label: '8 Pages Ahead (Turbo Default)'},
  {key: '12', label: '12 Pages Ahead (Aggressive Preload)'},
] as const;

const SOURCE_LANG_OPTIONS = [
  {key: 'auto', label: 'Auto-Detect (Zero-Key AI)'},
  {key: 'ja', label: 'Japanese (日本語)'},
  {key: 'ko', label: 'Korean (한국어)'},
  {key: 'zh', label: 'Chinese (中文)'},
  {key: 'en', label: 'English'},
] as const;

const TARGET_LANG_OPTIONS = [
  {key: 'en', label: 'English (Default)'},
  {key: 'es', label: 'Spanish (Español)'},
  {key: 'fr', label: 'French (Français)'},
  {key: 'de', label: 'German (Deutsch)'},
  {key: 'id', label: 'Indonesian (Bahasa Indonesia)'},
  {key: 'ru', label: 'Russian (Русский)'},
  {key: 'pt', label: 'Portuguese (Português)'},
] as const;

const ENGINE_OPTIONS = [
  {key: 'zeroKeyAuto', label: 'Zero-Key Auto (Offline + Public OCR)'},
  {key: 'customLlm', label: 'Custom LLM (OpenAI/Anthropic compatible)'},
  {key: 'mangaTranslatorServer', label: 'MangaTranslator Offline Server'},
] as const;

const BUBBLE_STYLE_OPTIONS = [
  {key: 'whiteBubble', label: 'Semi-Transparent White Bubble (Manga)'},
  {key: 'darkBox', label: 'Solid Dark Box (High Contrast)'},
] as const;

export default function PlayerSettings({navigation}: Props) {
  const colors = useM3Colors();

  useFocusEffect(
    useCallback(() => {
      if (!isTV) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        navigation.goBack();
        return true;
      });
      return () => sub.remove();
    }, [navigation]),
  );

  // 1. Reading Mode & Display State
  const [readingMode, setReadingMode] = useState<'webtoon' | 'manga' | 'comic' | 'double_spread'>(
    () => settingsStorage.getDefaultReadingMode(),
  );
  const [pageFit, setPageFit] = useState<'fit_width' | 'fit_screen' | 'fit_height' | 'original'>(
    () => settingsStorage.getPageFit(),
  );
  const [bgColor, setBgColor] = useState<'amoled' | 'dark' | 'sepia' | 'white'>(
    () => settingsStorage.getReaderBgColor(),
  );
  const [autoCropMargins, setAutoCropMargins] = useState<boolean>(() =>
    settingsStorage.isAutoCropMargins(),
  );

  // 2. Navigation & Controls State
  const [tapZones, setTapZones] = useState<boolean>(() =>
    settingsStorage.isTapZonesEnabled(),
  );
  const [volumeKeys, setVolumeKeys] = useState<boolean>(() =>
    settingsStorage.isVolumeKeysEnabled(),
  );
  const [keepAwake, setKeepAwake] = useState<boolean>(() =>
    settingsStorage.isKeepAwakeEnabled(),
  );
  const [pagePill, setPagePill] = useState<boolean>(() =>
    settingsStorage.isPageNumberPillEnabled(),
  );
  const [autoAdvance, setAutoAdvance] = useState<boolean>(() =>
    settingsStorage.isAutoAdvanceChapter(),
  );

  // 3. Streaming & Preload State
  const [imageQuality, setImageQuality] = useState<'raw' | 'dataSaver'>(() =>
    settingsStorage.getImageQuality(),
  );
  const [preloadCount, setPreloadCount] = useState<string>(() =>
    String(settingsStorage.getTurboPreloadCount()),
  );

  // 4. AI Translator State
  const [defaultLiveTranslate, setDefaultLiveTranslate] = useState<boolean>(() =>
    settingsStorage.isDefaultLiveTranslation(),
  );
  const [sourceLang, setSourceLang] = useState<string>(() =>
    settingsStorage.getTranslationSourceLang(),
  );
  const [targetLang, setTargetLang] = useState<string>(() =>
    settingsStorage.getTranslationTargetLang(),
  );
  const [engine, setEngine] = useState<'zeroKeyAuto' | 'customLlm' | 'mangaTranslatorServer'>(() =>
    settingsStorage.getTranslationEngine(),
  );
  const [bubbleStyle, setBubbleStyle] = useState<'whiteBubble' | 'darkBox'>(() =>
    settingsStorage.getTranslationBubbleStyle(),
  );
  const [customLlmUrl, setCustomLlmUrl] = useState<string>(() =>
    settingsStorage.getCustomLlmUrl(),
  );
  const [customLlmKey, setCustomLlmKey] = useState<string>(() =>
    settingsStorage.getCustomLlmApiKey(),
  );
  const [isUrlFocused, setIsUrlFocused] = useState<boolean>(false);
  const [isKeyFocused, setIsKeyFocused] = useState<boolean>(false);

  // 5. Provider & Resolver State
  const [autoDomainResolver, setAutoDomainResolver] = useState<boolean>(() =>
    settingsStorage.isAutoDomainResolverEnabled(),
  );
  const [singleRoomCollector, setSingleRoomCollector] = useState<boolean>(() =>
    settingsStorage.isSingleRoomCollectorEnabled(),
  );
  const [hideDuplicates, setHideDuplicates] = useState<boolean>(() =>
    settingsStorage.isHideDuplicatePosts(),
  );
  const [manifestUrl, setManifestUrl] = useState<string>(() =>
    settingsStorage.getProviderManifestUrl(),
  );
  const [isManifestFocused, setIsManifestFocused] = useState<boolean>(false);

  const handleClearTranslationCache = useCallback(async () => {
    const cleared = await mangaTranslatorEngine.clearAllTranslationCache();
    ToastAndroid.show(
      cleared > 0
        ? `Cleared ${cleared} cached page translations`
        : 'Translation cache is empty',
      ToastAndroid.SHORT,
    );
  }, []);

  const handleResetManifest = useCallback(() => {
    const defaultUrl =
      'https://raw.githubusercontent.com/Manimanjar/vega-komix-providers/main/manifest.json';
    settingsStorage.setProviderManifestUrl(defaultUrl);
    setManifestUrl(defaultUrl);
    ToastAndroid.show('Manifest URL reset to default', ToastAndroid.SHORT);
  }, []);

  return (
    <TVFocusGuide autoFocus={true} trapFocusRight={true} trapFocusDown={true} style={{flex: 1}}>
      <SettingsPage>
        {/* Header */}
        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12}}>
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
            <MaterialCommunityIcons name="arrow-left" size={28} color={colors.onBackground} />
          </TVFocusable>
          <AppText role="headlineLargeEmphasized" className="text-m3-on-background">
            Reader & Page Settings
          </AppText>
        </View>
        <AppText role="bodyLarge" className="mb-7 mt-1 text-m3-on-surface-variant">
          Reading modes, page fit, AMOLED background, and AI live translation
        </AppText>

        {/* 1. Reader & Display Settings */}
        <SettingsSection title="Reader & Display">
          <View style={{paddingHorizontal: 16, paddingVertical: 12}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, marginBottom: 8}}>
              Default Reading Mode
            </AppText>
            <DropdownField
              options={READING_MODE_OPTIONS}
              value={READING_MODE_OPTIONS.find(o => o.key === readingMode)}
              getKey={o => o.key}
              getLabel={o => o.label}
              onChange={o => {
                setReadingMode(o.key as any);
                settingsStorage.setDefaultReadingMode(o.key as any);
              }}
            />
          </View>

          <View style={{paddingHorizontal: 16, paddingVertical: 12}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, marginBottom: 8}}>
              Page Fit & Scaling
            </AppText>
            <DropdownField
              options={PAGE_FIT_OPTIONS}
              value={PAGE_FIT_OPTIONS.find(o => o.key === pageFit)}
              getKey={o => o.key}
              getLabel={o => o.label}
              onChange={o => {
                setPageFit(o.key as any);
                settingsStorage.setPageFit(o.key as any);
              }}
            />
          </View>

          <View style={{paddingHorizontal: 16, paddingVertical: 12}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, marginBottom: 8}}>
              Background Theme
            </AppText>
            <DropdownField
              options={THEME_OPTIONS}
              value={THEME_OPTIONS.find(o => o.key === bgColor)}
              getKey={o => o.key}
              getLabel={o => o.label}
              onChange={o => {
                setBgColor(o.key as any);
                settingsStorage.setReaderBgColor(o.key as any);
              }}
            />
          </View>

          <SettingsSwitchRow
            title="Auto-Crop White Margins"
            description="Automatically detect and trim scanning borders around comic pages"
            value={autoCropMargins}
            divider={false}
            onValueChange={next => {
              setAutoCropMargins(next);
              settingsStorage.setAutoCropMargins(next);
            }}
          />
        </SettingsSection>

        {/* 2. Navigation & Controls */}
        <SettingsSection title="Navigation & Controls">
          <SettingsSwitchRow
            title="Tap Zones Navigation"
            description="Tap left/right edges to turn page, tap center to toggle reader HUD"
            value={tapZones}
            onValueChange={next => {
              setTapZones(next);
              settingsStorage.setTapZonesEnabled(next);
            }}
          />
          <SettingsSwitchRow
            title="Hardware Volume Keys"
            description="Use phone Volume Up/Down buttons to turn pages smoothly"
            value={volumeKeys}
            onValueChange={next => {
              setVolumeKeys(next);
              settingsStorage.setVolumeKeysEnabled(next);
            }}
          />
          <SettingsSwitchRow
            title="Keep Screen Awake"
            description="Prevent display from turning off or dimming while reading comics"
            value={keepAwake}
            onValueChange={next => {
              setKeepAwake(next);
              settingsStorage.setKeepAwakeEnabled(next);
            }}
          />
          <SettingsSwitchRow
            title="Floating Page Number Pill"
            description="Show current page indicator (e.g. P. 12 / 48) at bottom center"
            value={pagePill}
            onValueChange={next => {
              setPagePill(next);
              settingsStorage.setPageNumberPillEnabled(next);
            }}
          />
          <SettingsSwitchRow
            title="Auto-Advance Chapter"
            description="Seamlessly jump to the next chapter when reaching the last page"
            value={autoAdvance}
            divider={false}
            onValueChange={next => {
              setAutoAdvance(next);
              settingsStorage.setAutoAdvanceChapter(next);
            }}
          />
        </SettingsSection>

        {/* 3. Streaming & Turbo Preload */}
        <SettingsSection title="Streaming & Turbo Preloader">
          <View style={{paddingHorizontal: 16, paddingVertical: 12}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, marginBottom: 8}}>
              Image Stream Quality
            </AppText>
            <DropdownField
              options={QUALITY_OPTIONS}
              value={QUALITY_OPTIONS.find(o => o.key === imageQuality)}
              getKey={o => o.key}
              getLabel={o => o.label}
              onChange={o => {
                setImageQuality(o.key as any);
                settingsStorage.setImageQuality(o.key as any);
              }}
            />
          </View>

          <View style={{paddingHorizontal: 16, paddingVertical: 12}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, marginBottom: 8}}>
              Turbo Preloader Lookahead
            </AppText>
            <DropdownField
              options={PRELOAD_OPTIONS}
              value={PRELOAD_OPTIONS.find(o => o.key === preloadCount)}
              getKey={o => o.key}
              getLabel={o => o.label}
              onChange={o => {
                setPreloadCount(o.key);
                settingsStorage.setTurboPreloadCount(parseInt(o.key, 10));
              }}
            />
          </View>
        </SettingsSection>

        {/* 4. AI Translator & Language */}
        <SettingsSection title="AI Live Translator (Zero-Key)">
          <SettingsSwitchRow
            title="Live Translation by Default"
            description="Automatically run bubble detection and translation when opening comics"
            value={defaultLiveTranslate}
            onValueChange={next => {
              setDefaultLiveTranslate(next);
              settingsStorage.setDefaultLiveTranslation(next);
            }}
          />

          <View style={{paddingHorizontal: 16, paddingVertical: 12}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, marginBottom: 8}}>
              Source Comic Language
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
              Target Translated Language
            </AppText>
            <DropdownField
              options={TARGET_LANG_OPTIONS}
              value={TARGET_LANG_OPTIONS.find(o => o.key === targetLang)}
              getKey={o => o.key}
              getLabel={o => o.label}
              onChange={o => {
                setTargetLang(o.key);
                settingsStorage.setTranslationTargetLang(o.key);
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
                API Key (Optional / Bearer Token)
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
              Translation Bubble Overlay Style
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

        {/* 5. Provider & Resolver Settings */}
        <SettingsSection title="Providers & Domain Resolver">
          <SettingsSwitchRow
            title="Auto-Domain Resolver"
            description="Automatically recover dead or blocked provider domains using dynamic mirrors"
            value={autoDomainResolver}
            onValueChange={next => {
              setAutoDomainResolver(next);
              settingsStorage.setAutoDomainResolverEnabled(next);
            }}
          />
          <SettingsSwitchRow
            title="Single-Room Series Collector"
            description="Group multi-chapter and duplicate provider releases under a single room"
            value={singleRoomCollector}
            onValueChange={next => {
              setSingleRoomCollector(next);
              settingsStorage.setSingleRoomCollectorEnabled(next);
            }}
          />
          <SettingsSwitchRow
            title="Hide Duplicate Releases"
            description="Filter identical comic titles across feeds and search results"
            value={hideDuplicates}
            onValueChange={next => {
              setHideDuplicates(next);
              settingsStorage.setHideDuplicatePosts(next);
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
        </SettingsSection>
      </SettingsPage>
    </TVFocusGuide>
  );
}
