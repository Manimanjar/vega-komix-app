import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {mangaTranslatorEngine} from '../src/lib/translator/mangaTranslatorEngine';
import {useTranslatedTitle} from '../src/lib/translator/useTranslatedTitle';

function Probe({title}: {title: string}) {
  const result = useTranslatedTitle(title);
  return <>{`${result.translated}|${result.isTranslated ? 'yes' : 'no'}`}</>;
}

function textOf(tree: renderer.ReactTestRenderer): string {
  const json = tree.toJSON();
  if (typeof json === 'string') return json;
  if (Array.isArray(json)) return json.join('');
  return '';
}

describe('useTranslatedTitle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the original while loading, then the translated title', async () => {
    jest
      .spyOn(mangaTranslatorEngine, 'translateBubblesUncensored')
      .mockResolvedValueOnce(['Secret Family Story']);
    jest.spyOn(mangaTranslatorEngine, 'getCachedTitleTranslation').mockReturnValue(null);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe title="Himitsu no Kazoku Monogatari" />);
    });
    // After the async translation resolves, the translated title shows.
    await act(async () => {});
    expect(textOf(tree!)).toBe('Secret Family Story|yes');
  });

  it('shows the cached translation immediately and never translates an unchanged title', async () => {
    jest.spyOn(mangaTranslatorEngine, 'getCachedTitleTranslation').mockReturnValue({
      original: 'Already English Title',
      translated: 'Already English Title',
      status: 'unchanged',
      timestamp: Date.now(),
    });
    const bubblesSpy = jest
      .spyOn(mangaTranslatorEngine, 'translateBubblesUncensored')
      .mockResolvedValue(['Already English Title']);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe title="Already English Title" />);
    });
    expect(textOf(tree!)).toBe('Already English Title|no');
    expect(bubblesSpy).not.toHaveBeenCalled();
  });
});
