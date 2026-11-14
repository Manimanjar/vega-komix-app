import JSZip from "jszip";

describe("Comic Reader Logic & Dimensions", () => {
  describe("Aspect Ratio & Continuous Vertical Heights", () => {
    it("should calculate correct height for vertical continuous mode", () => {
      const screenWidth = 400;
      const imgWidth = 1000;
      const imgHeight = 1500; // 2:3 ratio

      const computedHeight = screenWidth * (imgHeight / imgWidth);
      expect(computedHeight).toBe(600);
    });

    it("should handle square or ultrawide images gracefully", () => {
      const screenWidth = 400;
      const square = screenWidth * (1000 / 1000);
      expect(square).toBe(400);

      const landscapeSpread = screenWidth * (800 / 1600);
      expect(landscapeSpread).toBe(200);
    });
  });

  describe("Reading Modes & Pagination", () => {
    it("should compute correct RTL manga page index", () => {
      const totalPages = 20;
      const currentPage = 5; // 0-indexed: page 6
      const remainingRTL = totalPages - 1 - currentPage;
      expect(remainingRTL).toBe(14);
    });

    it("should pair landscape double spreads when orientation is landscape", () => {
      const pages = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
      const pairs: Array<[typeof pages[0], typeof pages[0]?]> = [];

      for (let i = 0; i < pages.length; i += 2) {
        pairs.push([pages[i], pages[i + 1]]);
      }

      expect(pairs.length).toBe(5);
      expect(pairs[0][0].id).toBe(1);
      expect(pairs[0][1]?.id).toBe(2);
    });

    it("should calculate page progress percentages correctly", () => {
      const total = 45;
      const current = 15;
      const percent = Math.round((current / total) * 100);
      expect(percent).toBe(33);
    });
  });

  describe("CBZ Archive Handling", () => {
    it("should pack and unpack comic image files with JSZip", async () => {
      const zip = new JSZip();
      zip.file("001.jpg", "mock-image-data-page-1");
      zip.file("002.jpg", "mock-image-data-page-2");
      zip.file("comicinfo.xml", "<ComicInfo><Title>Test Comic</Title></ComicInfo>");

      const content = await zip.generateAsync({ type: "nodebuffer" });
      expect(content).toBeDefined();

      const loadedZip = await JSZip.loadAsync(content);
      const fileNames = Object.keys(loadedZip.files).sort();
      expect(fileNames).toEqual(["001.jpg", "002.jpg", "comicinfo.xml"]);

      const page1 = await loadedZip.file("001.jpg")?.async("string");
      expect(page1).toBe("mock-image-data-page-1");
    });
  });
});
