import {mangaTranslatorEngine} from '../src/lib/translator/mangaTranslatorEngine';

describe('translateTitle', () => {
  let bubblesSpy: jest.SpyInstance;

  beforeEach(() => {
    bubblesSpy = jest
      .spyOn(mangaTranslatorEngine, 'translateBubblesUncensored')
      .mockImplementation(async (bubbles: any[]) => bubbles.map(b => b.text));
  });

  afterEach(() => {
    bubblesSpy.mockRestore();
  });

  it('translates a new title through the bubble pipeline and caches it', async () => {
    const title = 'Himitsu no Kazoku Monogatari';
    bubblesSpy.mockResolvedValueOnce(['Secret Family Story']);

    const first = await mangaTranslatorEngine.translateTitle(title);
    expect(first.status).toBe('translated');
    expect(first.translated).toBe('Secret Family Story');
    expect(bubblesSpy).toHaveBeenCalledTimes(1);

    // Second call is a cache hit: no second request.
    const second = await mangaTranslatorEngine.translateTitle(title);
    expect(second.status).toBe('cached');
    expect(second.translated).toBe('Secret Family Story');
    expect(bubblesSpy).toHaveBeenCalledTimes(1);
  });

  it('marks an already-English title unchanged and caches that too', async () => {
    const title = 'Secret Family Story';
    bubblesSpy.mockResolvedValueOnce(['Secret Family Story']);

    const first = await mangaTranslatorEngine.translateTitle(title);
    expect(first.status).toBe('unchanged');
    expect(first.translated).toBe(title);

    const second = await mangaTranslatorEngine.translateTitle(title);
    expect(second.status).toBe('cached');
    expect(bubblesSpy).toHaveBeenCalledTimes(1);
  });

  it('shares one request between concurrent calls for the same title', async () => {
    const title = 'Deduped Doujin Title';
    bubblesSpy.mockResolvedValueOnce(['Deduped Title Translated']);

    const [a, b] = await Promise.all([
      mangaTranslatorEngine.translateTitle(title),
      mangaTranslatorEngine.translateTitle(title),
    ]);
    expect(a.translated).toBe('Deduped Title Translated');
    expect(b.translated).toBe('Deduped Title Translated');
    expect(bubblesSpy).toHaveBeenCalledTimes(1);
  });

  it('returns the original on error and does not cache the failure', async () => {
    const title = 'Failing Title XYZ';
    bubblesSpy.mockRejectedValueOnce(new Error('network down'));
    bubblesSpy.mockResolvedValueOnce(['Failing Title Translated']);

    const first = await mangaTranslatorEngine.translateTitle(title);
    expect(first.status).toBe('error');
    expect(first.translated).toBe(title);

    const second = await mangaTranslatorEngine.translateTitle(title);
    expect(second.status).toBe('translated');
    expect(second.translated).toBe('Failing Title Translated');
    expect(bubblesSpy).toHaveBeenCalledTimes(2);
  });

  it('returns unchanged for an empty title without any request', async () => {
    const result = await mangaTranslatorEngine.translateTitle('   ');
    expect(result.status).toBe('unchanged');
    expect(result.translated).toBe('');
    expect(bubblesSpy).not.toHaveBeenCalled();
  });
});
