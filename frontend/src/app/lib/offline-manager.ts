import { dispatchToast } from "@/app/lib/toast";

export const checkStorageLimit = async (): Promise<boolean> => {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      const usagePercentage = ((estimate.usage || 0) / (estimate.quota || 1)) * 100;
      // Prevent caching if we've used more than 85% of available quota
      return usagePercentage < 85; 
    } catch (e) {
      console.warn("Storage API error:", e);
    }
  }
  return true; // Fallback if API is unavailable
};

/**
 * Ask the service worker to add or drop a stored file in the offline cache.
 *
 * The `CACHE_PDF` / `REMOVE_PDF` message names are intentionally unchanged even
 * though any supported file type can now be cached — they are the wire protocol
 * shared with `worker/index.ts`, and renaming them would break for every user
 * whose browser still has the previously installed service worker.
 */
export const manageOfflineFile = async (url: string, action: 'CACHE_PDF' | 'REMOVE_PDF'): Promise<boolean> => {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    console.warn("Service worker not active.");
    return false;
  }

  if (action === 'CACHE_PDF') {
    const hasSpace = await checkStorageLimit();
    if (!hasSpace) {
      dispatchToast("Storage Full", "Device storage is almost full. Cannot save this file for offline viewing.", "error");
      return false;
    }
  }

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data.success);
    };

    navigator.serviceWorker.controller!.postMessage(
      { type: action, url },
      [messageChannel.port2]
    );
  });
};