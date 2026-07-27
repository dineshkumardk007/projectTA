import { describe, expect, it } from 'vitest';
import { detectDeviceType } from './device';

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 13; SM-M215F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

describe('detectDeviceType', () => {
  it('recognises phones', () => {
    expect(detectDeviceType({ userAgent: ANDROID_CHROME })).toBe('mobile');
    expect(detectDeviceType({ userAgent: IPHONE_SAFARI })).toBe('mobile');
  });

  it('recognises desktops', () => {
    expect(detectDeviceType({ userAgent: WINDOWS_CHROME })).toBe('desktop');
  });

  it('prefers the display-mode hint, since an installed PWA lies about its user agent', () => {
    // The whole reason the hint exists: byte-identical user agent, different app.
    expect(detectDeviceType({ userAgent: ANDROID_CHROME, displayMode: 'standalone' })).toBe('pwa');
    expect(detectDeviceType({ userAgent: WINDOWS_CHROME, displayMode: 'fullscreen' })).toBe('pwa');
    expect(detectDeviceType({ userAgent: ANDROID_CHROME, displayMode: 'browser' })).toBe('mobile');
  });

  it('falls back to desktop when nothing is known, rather than throwing', () => {
    expect(detectDeviceType({})).toBe('desktop');
    expect(detectDeviceType({ userAgent: null, displayMode: null })).toBe('desktop');
  });
});
