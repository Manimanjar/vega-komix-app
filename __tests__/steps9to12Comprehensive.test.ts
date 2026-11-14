import { swrContentCache } from "../src/lib/cache/swrContentCache";
import { speculativePreviewEngine } from "../src/lib/cache/speculativePreviewEngine";
import { turboPreloader } from "../src/lib/reader/turboPreloader";
import { mangaTranslatorEngine } from "../src/lib/translator/mangaTranslatorEngine";
import { DEFAULT_PROVIDER_SOURCE } from "../src/lib/storage/extensionStorage";

describe("Steps 9–12 Comprehensive Verification", () => {
  describe("Step 9: Zero-Latency SWR & Speculative Preview Engine", () => {
    it("should instantly store and retrieve cached feed posts in 0ms", () => {
      const mockPosts = [
        { title: "One Piece", link: "https://mangadex.org/title/123", image: "https://cdn.example.com/cover.jpg" },
      ];

      swrContentCache.setPosts("mangadex", "popular", 1, mockPosts);
      const cached = swrContentCache.getPosts("mangadex", "popular", 1);

      expect(cached).toBeDefined();
      expect(cached?.length).toBe(1);
      expect(cached?.[0].title).toBe("One Piece");
    });

    it("should detect meaningful content changes in feed items", () => {
      const cached = [
        { title: "Manga A", link: "https://example.com/a", image: "https://example.com/a.jpg" },
      ];
      const freshSame = [
        { title: "Manga A", link: "https://example.com/a", image: "https://example.com/a.jpg" },
      ];
      const freshDiff = [
        { title: "Manga B", link: "https://example.com/b", image: "https://example.com/b.jpg" },
      ];

      expect(swrContentCache.hasChanged(cached, freshSame)).toBe(false);
      expect(swrContentCache.hasChanged(cached, freshDiff)).toBe(true);
    });

    it("should deduplicate in-flight concurrent requests", async () => {
      let callCount = 0;
      const slowFetcher = async () => {
        callCount++;
        return "result-data";
      };

      const [res1, res2] = await Promise.all([
        swrContentCache.dedupe("test-key", slowFetcher),
        swrContentCache.dedupe("test-key", slowFetcher),
      ]);

      expect(res1).toBe("result-data");
      expect(res2).toBe("result-data");
      expect(callCount).toBe(1);
    });
  });

  describe("Step 10: 2:3 Thumbnail Pipeline & Turbo Preloader Sliding Window", () => {
    it("should verify OOM Memory Guard mounts bitmaps only in active window", () => {
      const currentIndex = 10;
      // Active window is [currentIndex - 3, currentIndex + 5] => [7, 15]
      expect(turboPreloader.isPageBitmapActive(10, currentIndex)).toBe(true);
      expect(turboPreloader.isPageBitmapActive(7, currentIndex)).toBe(true);
      expect(turboPreloader.isPageBitmapActive(15, currentIndex)).toBe(true);

      // Distant pages outside [7, 15] must be false to avoid OOM
      expect(turboPreloader.isPageBitmapActive(6, currentIndex)).toBe(false);
      expect(turboPreloader.isPageBitmapActive(16, currentIndex)).toBe(false);
      expect(turboPreloader.isPageBitmapActive(0, currentIndex)).toBe(false);
      expect(turboPreloader.isPageBitmapActive(25, currentIndex)).toBe(false);
    });

    it("should track preloaded URL state in turbo preloader", () => {
      expect(turboPreloader.isUrlPrefetched("")).toBe(false);
      expect(turboPreloader.isUrlPrefetched("https://example.com/unknown.jpg")).toBe(false);
    });
  });

  describe("Step 11: Manga Translator Engine Bubble Clustering & Pipeline", () => {
    it("should cluster vertical and adjacent speech lines into unified bubbles", () => {
      const rawLines = [
        { text: "俺は", box: { xRatio: 0.8, yRatio: 0.1, wRatio: 0.05, hRatio: 0.08 } },
        { text: "海賊王に", box: { xRatio: 0.74, yRatio: 0.1, wRatio: 0.05, hRatio: 0.10 } },
        { text: "なる！", box: { xRatio: 0.68, yRatio: 0.11, wRatio: 0.05, hRatio: 0.08 } },
      ];

      const bubbles = mangaTranslatorEngine.clusterLinesIntoSpeechBubbles(rawLines);
      expect(bubbles.length).toBe(1);
      expect(bubbles[0].text).toContain("俺は");
      expect(bubbles[0].text).toContain("海賊王に");
      expect(bubbles[0].text).toContain("なる！");
    });

    it("should cache translated page bubbles for instant recall without network latency", () => {
      const chapterId = "chapter_100";
      const pageIndex = 1;
      const mockResult = {
        chapterId,
        pageIndex,
        targetLang: "en",
        bubbles: [
          {
            id: "b1",
            originalText: "こんにちは",
            translatedText: "Hello",
            box: { xRatio: 0.5, yRatio: 0.5, wRatio: 0.2, hRatio: 0.1 },
          },
        ],
        rawText: "こんにちは",
      };

      mangaTranslatorEngine.savePageTranslation(mockResult);
      const cached = mangaTranslatorEngine.getCachedPageTranslation(chapterId, pageIndex);

      expect(cached).toBeDefined();
      expect(cached?.bubbles?.[0]?.translatedText).toBe("Hello");
      expect(cached?.targetLang).toBe("en");
    });
  });

  describe("Step 12: Production Providers, Manifest Source, and Resilience", () => {
    it("should have DEFAULT_PROVIDER_SOURCE pointing to isolated vega-komix-providers repository", () => {
      expect(DEFAULT_PROVIDER_SOURCE.manifestUrl).toContain("Manimanjar/vega-komix-providers");
      expect(DEFAULT_PROVIDER_SOURCE.manifestUrl).toContain("manifest.json");
      expect(DEFAULT_PROVIDER_SOURCE.manifestUrl).not.toContain("vega-providers/main");
      expect(DEFAULT_PROVIDER_SOURCE.author).toBe("Manimanjar");
    });
  });
});
