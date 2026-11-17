import React, {useCallback, useState} from 'react';
import {
  BackHandler,
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
import DropdownField from '../../components/ui/DropdownField';

type Props = NativeStackScreenProps<SettingsStackParamList, 'PlayerSettings'>;

const READING_MODE_OPTIONS = [
  {key: 'webtoon', label: 'Vertical Webtoon (Continuous)'},
  {key: 'manga', label: 'Right-to-Left (Manga Paged)'},
  {key: 'comic', label: 'Left-to-Right (Comic Paged)'},
  {key: 'double_spread', label: 'Landscape 2-Page Spread'},
] as const;

const PAGE_FIT_OPTIONS = [
  {key: 'fit_height', label: 'Fit Height'},
  {key: 'fit_screen', label: 'Fit Entire Page'},
  {key: 'original', label: 'Original Size'},
] as const;

const THEME_OPTIONS = [
  {key: 'amoled', label: 'True AMOLED Black'},
  {key: 'dark', label: 'Dark Slate'},
  {key: 'sepia', label: 'Sepia Paper'},
  {key: 'white', label: 'Pure White'},
] as const;

const QUALITY_OPTIONS = [
  {key: 'raw', label: 'Original Raw Quality (Highest)'},
  {key: 'dataSaver', label: 'Data Saver'},
] as const;

const PRELOAD_OPTIONS = [
  {key: '4', label: '4 Pages'},
  {key: '8', label: '8 Pages'},
  {key: '12', label: '12 Pages'},
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
  const [highQualityRendering, setHighQualityRendering] = useState<boolean>(() =>
    settingsStorage.isHighQualityRendering(),
  );

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
          Reading mode, page fit, AMOLED background, and gestures
        </AppText>

        {/* 1. Reading & Page Display */}
        <SettingsSection title="Reading & Page Display">
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
              Page Scale Mode
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
              Reader Background
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

        {/* 2. Controls & Gestures */}
        <SettingsSection title="Controls & Gestures">
          <SettingsSwitchRow
            title="Edge Tap Zones to Turn/Scroll Pages"
            description="Tap screen edges to turn or scroll pages smoothly (tap center for HUD)"
            value={tapZones}
            onValueChange={next => {
              setTapZones(next);
              settingsStorage.setTapZonesEnabled(next);
            }}
          />
          <SettingsSwitchRow
            title="Volume Keys Turn Pages"
            description="Use phone volume buttons to turn or scroll pages"
            value={volumeKeys}
            onValueChange={next => {
              setVolumeKeys(next);
              settingsStorage.setVolumeKeysEnabled(next);
            }}
          />
          <SettingsSwitchRow
            title="Keep Screen Awake in Reader"
            description="Prevent screen from dimming or sleeping while reading"
            value={keepAwake}
            onValueChange={next => {
              setKeepAwake(next);
              settingsStorage.setKeepAwakeEnabled(next);
            }}
          />
          <SettingsSwitchRow
            title="Show Floating Page Counter (1 / 24)"
            description="Display floating page counter indicator in reader HUD"
            value={pagePill}
            onValueChange={next => {
              setPagePill(next);
              settingsStorage.setPageNumberPillEnabled(next);
            }}
          />
          <SettingsSwitchRow
            title="Auto-Load Next Chapter on Last Page"
            description="Seamlessly proceed to the next chapter when reaching the last page"
            value={autoAdvance}
            divider={false}
            onValueChange={next => {
              setAutoAdvance(next);
              settingsStorage.setAutoAdvanceChapter(next);
            }}
          />
        </SettingsSection>

        {/* 3. Image Quality & Preloader */}
        <SettingsSection title="Image Quality & Preloader">
          <View style={{paddingHorizontal: 16, paddingVertical: 12}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, marginBottom: 8}}>
              Image Quality
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
              Turbo Preload Window
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

          <SettingsSwitchRow
            title="Original Quality (32-bit ARGB)"
            description="Render 100% full original resolution with 32-bit color depth (no downsampling). Keep ON for best clarity."
            value={highQualityRendering}
            divider={false}
            onValueChange={next => {
              setHighQualityRendering(next);
              settingsStorage.setHighQualityRendering(next);
            }}
          />
        </SettingsSection>
      </SettingsPage>
    </TVFocusGuide>
  );
}
