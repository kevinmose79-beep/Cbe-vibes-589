import { registerPlugin } from '@capacitor/core';

export interface AppStartupPlugin {
  notifyAppReady(): Promise<void>;
}

/**
 * Direct typed bridge to native Android AppStartupPlugin.
 *
 * On Android: notifies MainActivity that React's initial safe interface has committed and painted,
 * dismissing the native AndroidX splash screen without intermediate blank frames.
 *
 * On Web/Desktop: safe no-op.
 */
export const NativeAppStartup = registerPlugin<AppStartupPlugin>('AppStartup', {
  web: {
    async notifyAppReady(): Promise<void> {
      // Safe no-op in browser / web environments
    },
  },
});
