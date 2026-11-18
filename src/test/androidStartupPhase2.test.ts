import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NativeAppStartup } from '../lib/nativeAppStartup';

describe('Phase 2A & 2B: Android Startup Experience Verification', () => {
  it('NativeAppStartup provides a safe no-op on web without throwing', async () => {
    await expect(NativeAppStartup.notifyAppReady()).resolves.toBeUndefined();
  });

  it('index.html contains the flat green CBE Hub graduation-cap fallback without text or dots', () => {
    const htmlPath = path.resolve(__dirname, '../../index.html');
    const content = fs.readFileSync(htmlPath, 'utf-8');

    // Root element retained
    expect(content).toContain('id="root"');
    expect(content).toContain('id="pre-hydration-loader"');

    // Flat #176B45 background
    expect(content).toContain('background-color:#176B45');

    // Displays existing graduation cap SVG
    expect(content).toContain('M22 10v6M2 10l10-5 10 5-10 5z');
    expect(content).toContain('M6 12v5c3 3 9 3 12 0v-5');

    // Strict requirements: no "Please Wait", no dots, no Muchorwe branding
    expect(content).not.toContain('Please Wait');
    expect(content).not.toContain('pulse-dot');
    expect(content).not.toContain('Muchorwe');
  });

  it('styles.xml uses ic_launcher_foreground and matching background on splash and post-splash window', () => {
    const stylesPath = path.resolve(__dirname, '../../android/app/src/main/res/values/styles.xml');
    const content = fs.readFileSync(stylesPath, 'utf-8');

    // Splash animated icon set to existing graduation cap
    expect(content).toContain('<item name="windowSplashScreenAnimatedIcon">@drawable/ic_launcher_foreground</item>');

    // Splash background set to brand green
    expect(content).toContain('<item name="windowSplashScreenBackground">@color/ic_launcher_background</item>');

    // Post-splash window background prevents blank flash
    expect(content).toContain('<item name="android:background">@color/ic_launcher_background</item>');

    // No Muchorwe branding
    expect(content).not.toContain('Muchorwe');
  });

  it('MainActivity.java implements AndroidX keep condition with monotonic clock, 4s ceiling and instance flag', () => {
    const mainActivityPath = path.resolve(__dirname, '../../android/app/src/main/java/ke/ac/school/cbe/MainActivity.java');
    const content = fs.readFileSync(mainActivityPath, 'utf-8');

    // Monotonic clock used instead of wall clock
    expect(content).toContain('SystemClock.elapsedRealtime()');

    // 4000ms safety ceiling
    expect(content).toContain('MAX_SPLASH_TIMEOUT_MS = 4000L');

    // Instance-level flag
    expect(content).toContain('private volatile boolean isAppReady = false;');
    expect(content).toContain('isAppReady = false;');

    // setKeepOnScreenCondition registered
    expect(content).toContain('splashScreen.setKeepOnScreenCondition(');

    // AppStartupPlugin registered
    expect(content).toContain('registerPlugin(AppStartupPlugin.class);');
  });

  it('AppStartupPlugin.java safely dispatches to MainActivity instance without static access', () => {
    const pluginPath = path.resolve(__dirname, '../../android/app/src/main/java/ke/ac/school/cbe/AppStartupPlugin.java');
    const content = fs.readFileSync(pluginPath, 'utf-8');

    expect(content).toContain('@CapacitorPlugin(name = "AppStartup")');
    expect(content).toContain('public void notifyAppReady(PluginCall call)');
    expect(content).toContain('Activity activity = getActivity();');
    expect(content).toContain('if (activity instanceof MainActivity)');
    expect(content).toContain('((MainActivity) activity).setAppReady(true);');
  });

  it('Phase 2G: index.html pre-hydration loader and App.tsx loading screen have aligned responsive dimensions and stroke', () => {
    const htmlPath = path.resolve(__dirname, '../../index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    // index.html responsive clamp sizing & stroke
    expect(htmlContent).toContain('clamp(120px,36.7vw,160px)');
    expect(htmlContent).toContain('stroke-width="1.2"');

    const appPath = path.resolve(__dirname, '../../src/App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf-8');

    // App.tsx matching responsive clamp sizing & strokeWidth
    expect(appContent).toContain('clamp(120px,36.7vw,160px)');
    expect(appContent).toContain('strokeWidth={1.2}');
  });
});

