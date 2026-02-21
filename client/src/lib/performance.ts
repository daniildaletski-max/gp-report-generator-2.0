export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return function (...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;
  return function (...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastRun >= limit) {
      func(...args);
      lastRun = now;
    }
  };
}

export function memoize<T extends (...args: unknown[]) => unknown>(fn: T): T {
  const cache = new Map();
  return function (...args: unknown[]) {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  } as T;
}

export async function measurePerformance<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const end = performance.now();
    if (process.env.NODE_ENV === "development") {
      console.log(`[PERF] ${name}: ${(end - start).toFixed(2)}ms`);
    }
    return result;
  } catch (error) {
    const end = performance.now();
    console.error(`[PERF] ${name} failed after ${(end - start).toFixed(2)}ms:`, error);
    throw error;
  }
}

export function compressImage(file: File, quality: number = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width * 0.8;
        canvas.height = img.height * 0.8;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(resolve, "image/jpeg", quality);
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function createVirtualScroller(
  itemCount: number,
  itemHeight: number,
  containerHeight: number,
  scrollTop: number
) {
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(startIndex + visibleCount + 1, itemCount);
  const offsetY = startIndex * itemHeight;

  return {
    visibleCount,
    startIndex,
    endIndex,
    offsetY,
    items: Array.from({ length: endIndex - startIndex }, (_, i) => startIndex + i),
  };
}

export const KEYBOARD_SHORTCUTS = {
  SEARCH: "Cmd+K",
  FOCUS_FIRST: "Home",
  FOCUS_LAST: "End",
  PREVIOUS_PAGE: "ArrowLeft",
  NEXT_PAGE: "ArrowRight",
  SELECT_ALL: "Cmd+A",
  COPY: "Cmd+C",
  PASTE: "Cmd+V",
} as const;

export function registerKeyboardShortcut(
  key: string,
  handler: () => void,
  options: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}
): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (
      event.key === key &&
      event.ctrlKey === (options.ctrlKey ?? false) &&
      event.shiftKey === (options.shiftKey ?? false) &&
      event.altKey === (options.altKey ?? false)
    ) {
      event.preventDefault();
      handler();
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}
