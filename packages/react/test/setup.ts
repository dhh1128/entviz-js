import { vi } from "vitest";

// jsdom implements none of these; the pill needs them for copy / image / popover
// positioning. Stubbed here so the component's real branches execute in tests.

// --- clipboard (writeText + write/ClipboardItem) ---
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: vi.fn(async () => {}),
    write: vi.fn(async () => {}),
  },
});
class FakeClipboardItem {
  constructor(public items: Record<string, Blob>) {}
}
(globalThis as unknown as { ClipboardItem: unknown }).ClipboardItem = FakeClipboardItem;

// --- object URLs ---
URL.createObjectURL = vi.fn(() => "blob:fake");
URL.revokeObjectURL = vi.fn(() => {});

// --- canvas 2d + toBlob ---
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  scale: vi.fn(),
  drawImage: vi.fn(),
})) as unknown as HTMLCanvasElement["getContext"];
HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
  cb(new Blob(["png"], { type: "image/png" }));
};

// --- Image whose src setter resolves onload (no network in jsdom) ---
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 200;
  naturalHeight = 200;
  set src(_v: string) {
    Promise.resolve().then(() => this.onload?.());
  }
}
(globalThis as unknown as { Image: unknown }).Image = FakeImage;

// --- non-zero layout rects (jsdom returns all-zero) ---
Element.prototype.getBoundingClientRect = function (): DOMRect {
  return {
    x: 10, y: 10, top: 10, left: 10, right: 110, bottom: 30, width: 100, height: 20,
    toJSON: () => ({}),
  } as DOMRect;
};
