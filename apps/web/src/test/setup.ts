import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

function createMemoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      store = {};
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
    removeItem(key: string) {
      delete store[key];
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    }
  };
}

if (typeof window !== 'undefined') {
  if (!window.localStorage || typeof window.localStorage.clear !== 'function') {
    const memLocal = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', { value: memLocal, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: memLocal, configurable: true });
  }
  if (!window.sessionStorage || typeof window.sessionStorage.clear !== 'function') {
    const memSession = createMemoryStorage();
    Object.defineProperty(window, 'sessionStorage', { value: memSession, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: memSession, configurable: true });
  }

  if (!('BroadcastChannel' in window)) {
    class MockBroadcastChannel {
      name: string;
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor(name: string) {
        this.name = name;
      }
      postMessage() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
    }
    (window as unknown as { BroadcastChannel: typeof MockBroadcastChannel }).BroadcastChannel =
      MockBroadcastChannel;
  }

  if (!('matchMedia' in window)) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });
  }
}
