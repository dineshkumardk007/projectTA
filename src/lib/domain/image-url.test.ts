import { describe, expect, it } from 'vitest';
import { isPlatformImageUrl } from '@/lib/domain/image-url';

const CDN = ['https://pub-abc123.r2.dev'];

describe('isPlatformImageUrl', () => {
  it('treats absent and empty as "no image"', () => {
    // This is how a merchant removes a photo, so it must be allowed.
    expect(isPlatformImageUrl(null, CDN)).toBe(true);
    expect(isPlatformImageUrl(undefined, CDN)).toBe(true);
    expect(isPlatformImageUrl('', CDN)).toBe(true);
  });

  it('accepts paths written by the local provider', () => {
    expect(isPlatformImageUrl('/uploads/shops/abc/9f8e.jpg', [])).toBe(true);
  });

  it('accepts URLs on a configured storage origin', () => {
    expect(isPlatformImageUrl('https://pub-abc123.r2.dev/products/x/1.webp', CDN)).toBe(true);
  });

  it('rejects an arbitrary third-party image', () => {
    // The point of the rule: content on someone else's server can change after
    // it was approved, on every card showing that shop.
    expect(isPlatformImageUrl('https://i.imgur.com/cat.jpg', CDN)).toBe(false);
    expect(isPlatformImageUrl('https://example.com/logo.png', CDN)).toBe(false);
  });

  it('rejects a lookalike host that merely starts with the allowed origin', () => {
    expect(isPlatformImageUrl('https://pub-abc123.r2.dev.evil.net/x.jpg', CDN)).toBe(false);
  });

  it('rejects a protocol-relative URL disguised as a local path', () => {
    // "//evil.com/x.jpg" starts with a slash but is a remote URL.
    expect(isPlatformImageUrl('//evil.com/x.jpg', CDN)).toBe(false);
  });

  it('rejects path traversal in a local path', () => {
    expect(isPlatformImageUrl('/uploads/../../etc/passwd', [])).toBe(false);
  });

  it('rejects non-https storage URLs', () => {
    expect(isPlatformImageUrl('http://pub-abc123.r2.dev/x.jpg', CDN)).toBe(false);
  });

  it('rejects javascript and data URLs', () => {
    expect(isPlatformImageUrl('javascript:alert(1)', CDN)).toBe(false);
    expect(isPlatformImageUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', CDN)).toBe(false);
  });

  it('rejects a remote URL when no storage origin is configured', () => {
    expect(isPlatformImageUrl('https://pub-abc123.r2.dev/x.jpg', [])).toBe(false);
  });

  it('ignores malformed entries in the allowlist rather than throwing', () => {
    expect(isPlatformImageUrl('https://pub-abc123.r2.dev/x.jpg', ['not a url', ...CDN])).toBe(true);
  });
});
