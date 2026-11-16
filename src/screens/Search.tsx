import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  ScrollView,
  Keyboard,
  TouchableOpacity,
  ToastAndroid,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {FadeInDown} from 'react-native-reanimated';

import {SearchStackParamList, TabStackParamList} from '../App';
import ScreenSafeArea from '../components/ui/ScreenSafeArea';
import AppText from '../components/ui/Text';
import SearchField, {type SearchFieldRef} from '../components/ui/SearchField';
import IconButton from '../components/ui/IconButton';
import {useM3Colors} from '../theme/M3PaletteContext';
import {isTV} from '../lib/tv';
import {AsyncStorage} from '../lib/storage/asyncStorage';
import {MMKV} from '../lib/Mmkv';

const KEY_SEARCH_HISTORY = 'vega_komix_search_history';
const MAX_HISTORY_ITEMS = 25;

// 15 Curated comic genre tags for instant 1-tap discovery
export const COMIC_GENRES = [
  {name: 'Action', icon: 'sword-cross'},
  {name: 'Romance', icon: 'heart-outline'},
  {name: 'Isekai', icon: 'portal'},
  {name: 'Fantasy', icon: 'creation'},
  {name: 'Slice of Life', icon: 'coffee-outline'},
  {name: 'Sci-Fi', icon: 'rocket-launch-outline'},
  {name: 'Martial Arts', icon: 'karate'},
  {name: 'Comedy', icon: 'emoticon-happy-outline'},
  {name: 'Drama', icon: 'theater'},
  {name: 'Horror', icon: 'skull-outline'},
  {name: 'Mystery', icon: 'magnify'},
  {name: 'Psychological', icon: 'head-cog-outline'},
  {name: 'Supernatural', icon: 'ghost-outline'},
  {name: 'Historical', icon: 'castle'},
  {name: 'Sports', icon: 'basketball'},
];

const HeaderContainer = isTV ? View : Animated.View;
const AnimatedContainer = Animated.View;

export const Search: React.FC = () => {
  const colors = useM3Colors();
  const navigation = useNavigation<NativeStackNavigationProp<SearchStackParamList>>();

  const [searchText, setSearchText] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchFieldNode, setSearchFieldNode] = useState<number | null>(null);
  const [clearBtnNode, setClearBtnNode] = useState<number | null>(null);

  const searchFieldRef = useRef<SearchFieldRef>(null);
  const focusAfterTabResetRef = useRef(false);

  // Load search history from AsyncStorage (with MMKV fallback)
  const loadSearchHistory = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(KEY_SEARCH_HISTORY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSearchHistory(parsed);
          return;
        }
      }
      const legacyMmkv = MMKV.getArray<string>('searchHistory') || [];
      setSearchHistory(legacyMmkv);
    } catch {
      setSearchHistory([]);
    }
  }, []);

  useEffect(() => {
    loadSearchHistory();
  }, [loadSearchHistory]);

  // Tab reset & focus behavior
  useEffect(() => {
    const tabNavigation = navigation.getParent<BottomTabNavigationProp<TabStackParamList>>();
    if (!tabNavigation) return;

    const unsubscribeTabPress = tabNavigation.addListener('tabPress', event => {
      const state = tabNavigation.getState();
      if (state.routes[state.index]?.name !== 'SearchStack') return;

      if (!navigation.isFocused()) {
        event.preventDefault();
        focusAfterTabResetRef.current = true;
        navigation.popToTop();
        return;
      }

      if (!isTV) {
        searchFieldRef.current?.focus();
      }
    });

    const unsubscribeFocus = navigation.addListener('focus', () => {
      loadSearchHistory();
      if (!focusAfterTabResetRef.current) return;
      focusAfterTabResetRef.current = false;
      if (!isTV) {
        searchFieldRef.current?.focus();
      }
    });

    return () => {
      unsubscribeTabPress();
      unsubscribeFocus();
    };
  }, [navigation, loadSearchHistory]);

  const handleTextChange = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  const handleClearText = useCallback(() => {
    setSearchText('');
  }, []);

  // Save query to history in AsyncStorage and MMKV
  const saveSearchQuery = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      try {
        const filtered = searchHistory.filter(
          item => item.toLowerCase() !== trimmed.toLowerCase(),
        );
        const updated = [trimmed, ...filtered].slice(0, MAX_HISTORY_ITEMS);
        setSearchHistory(updated);
        await AsyncStorage.setItem(KEY_SEARCH_HISTORY, JSON.stringify(updated));
        MMKV.setArray('searchHistory', updated);
      } catch {}
    },
    [searchHistory],
  );

  // Execute Search
  const handleSearch = useCallback(
    (query: string) => {
      Keyboard.dismiss();
      const trimmed = query.trim();
      if (!trimmed) return;

      saveSearchQuery(trimmed);
      navigation.navigate('SearchResults', {
        filter: trimmed,
      });
    },
    [navigation, saveSearchQuery],
  );

  // Remove individual history chip
  const removeHistoryItem = useCallback(
    async (itemToRemove: string) => {
      try {
        const updated = searchHistory.filter(item => item !== itemToRemove);
        setSearchHistory(updated);
        await AsyncStorage.setItem(KEY_SEARCH_HISTORY, JSON.stringify(updated));
        MMKV.setArray('searchHistory', updated);
      } catch {}
    },
    [searchHistory],
  );

  // Clear all history
  const clearAllHistory = useCallback(async () => {
    try {
      setSearchHistory([]);
      await AsyncStorage.removeItem(KEY_SEARCH_HISTORY);
      MMKV.setArray('searchHistory', []);
      ToastAndroid.show('Search history cleared', ToastAndroid.SHORT);
    } catch {}
  }, []);

  return (
    <ScreenSafeArea className="flex-1 bg-m3-background">
      {/* Header & Search Bar */}
      <HeaderContainer
        {...(!isTV ? {entering: FadeInDown.duration(300)} : {})}
        className="px-4 pt-4">
        <AppText
          role="bodyLarge"
          style={{color: colors.onSurfaceVariant, marginBottom: 16}}>
          Search across all comic & manga providers
        </AppText>
        <View className="flex-row items-center space-x-3 mb-2">
          <View className="flex-1">
            <SearchField
              ref={searchFieldRef}
              value={searchText}
              onChangeText={handleTextChange}
              onSubmit={handleSearch}
              onClear={handleClearText}
              placeholder="Search comics, manhwa, manga..."
              nextFocusRight={isTV && searchText.length > 0 ? clearBtnNode : undefined}
              onNodeHandle={setSearchFieldNode}
            />
          </View>
          {isTV && searchText.length > 0 && (
            <IconButton
              icon="close"
              label="Clear search"
              onPress={handleClearText}
              size={18}
              nextFocusLeft={searchFieldNode}
              onNodeHandle={setClearBtnNode}
            />
          )}
        </View>
      </HeaderContainer>

      {/* Main Search Body */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{padding: 16, paddingBottom: 40}}
        showsVerticalScrollIndicator={false}>
        {/* Live Search Trigger Card (when query entered) */}
        {searchText.trim().length > 0 && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handleSearch(searchText)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surfaceContainerHigh || '#282828',
              borderRadius: 20,
              padding: 14,
              marginBottom: 20,
              borderColor: colors.primary,
              borderWidth: 1.5,
            }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 14,
              }}>
              <MaterialCommunityIcons name="magnify" size={22} color="#FFFFFF" />
            </View>
            <View style={{flex: 1}}>
              <AppText
                role="bodyLargeEmphasized"
                style={{color: colors.onSurface}}>
                Search for "{searchText.trim()}"
              </AppText>
              <AppText
                role="bodySmall"
                style={{color: colors.onSurfaceVariant, marginTop: 2}}>
                Find chapters across all active providers
              </AppText>
            </View>
            <MaterialCommunityIcons
              name="arrow-right"
              size={20}
              color={colors.primary}
            />
          </TouchableOpacity>
        )}

        {/* Recent Search History Chips */}
        {searchHistory.length > 0 && (
          <View style={{marginBottom: 24}}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <MaterialCommunityIcons
                  name="history"
                  size={18}
                  color={colors.onSurfaceVariant}
                />
                <AppText
                  role="labelLargeEmphasized"
                  style={{color: colors.onSurface, marginLeft: 6}}>
                  Recent Searches
                </AppText>
              </View>
              <TouchableOpacity
                onPress={clearAllHistory}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <AppText
                  role="labelMedium"
                  style={{color: colors.primary, fontWeight: '700'}}>
                  Clear History
                </AppText>
              </TouchableOpacity>
            </View>

            {/* Dismissible Chips */}
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
              {searchHistory.map((term, index) => (
                <View
                  key={`${term}-${index}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.surfaceContainerLow || '#212121',
                    borderColor: colors.outlineVariant || 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    borderRadius: 18,
                    paddingVertical: 6,
                    paddingLeft: 12,
                    paddingRight: 6,
                  }}>
                  <TouchableOpacity
                    onPress={() => {
                      setSearchText(term);
                      handleSearch(term);
                    }}
                    style={{flexDirection: 'row', alignItems: 'center'}}>
                    <AppText
                      role="labelMedium"
                      style={{color: colors.onSurface}}>
                      {term}
                    </AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removeHistoryItem(term)}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                    style={{marginLeft: 6, padding: 2}}>
                    <MaterialCommunityIcons
                      name="close"
                      size={14}
                      color={colors.onSurfaceVariant}
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Quick Comic Genre & Manga Suggestion Tags */}
        <View style={{marginBottom: 24}}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 12,
            }}>
            <MaterialCommunityIcons
              name="tag-multiple-outline"
              size={18}
              color={colors.onSurfaceVariant}
            />
            <AppText
              role="labelLargeEmphasized"
              style={{color: colors.onSurface, marginLeft: 6}}>
              Popular Genres & Categories
            </AppText>
          </View>

          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
            {COMIC_GENRES.map(genre => (
              <TouchableOpacity
                key={genre.name}
                activeOpacity={0.7}
                onPress={() => {
                  setSearchText(genre.name);
                  handleSearch(genre.name);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.secondaryContainer || '#372F47',
                  borderRadius: 16,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                }}>
                <MaterialCommunityIcons
                  name={genre.icon as any}
                  size={15}
                  color={colors.onSecondaryContainer || '#E8DEF8'}
                  style={{marginRight: 6}}
                />
                <AppText
                  role="labelMediumEmphasized"
                  style={{color: colors.onSecondaryContainer || '#E8DEF8'}}>
                  {genre.name}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Empty State Banner (when no active query and no history) */}
        {searchHistory.length === 0 && searchText.trim().length === 0 && (
          <AnimatedContainer
            entering={FadeInDown.duration(300)}
            className="items-center justify-center py-10 px-4">
            <View className="mb-4 rounded-[28px] bg-m3-secondary-container p-6">
              <MaterialCommunityIcons
                name="book-search-outline"
                size={36}
                color={colors.onSecondaryContainer}
              />
            </View>
            <AppText
              role="bodyLargeEmphasized"
              className="text-center text-m3-on-surface">
              Find your next comic or manga
            </AppText>
            <AppText
              role="bodyMedium"
              className="mt-1 text-center text-m3-on-surface-variant">
              Search by title, author, or genre across all providers
            </AppText>
          </AnimatedContainer>
        )}
      </ScrollView>
    </ScreenSafeArea>
  );
};

export default Search;
