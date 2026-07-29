import { describe, expect, it } from 'vitest';
import { appUrlSeverity, describeAppUrlProblem, isUnreachableHost } from '@/lib/domain/public-url';

describe('isUnreachableHost', () => {
  it.each([
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '10.0.0.5',
    '192.168.29.197',
    '172.16.0.1',
    '172.31.255.254',
  ])('rejects %s', (host) => {
    expect(isUnreachableHost(host)).toBe(true);
  });

  it.each([
    'takeaway.vercel.app',
    'order.takeaway.in',
    '8.8.8.8',
    // Just outside the private ranges — these are ordinary public addresses and
    // must not be caught by the RFC 1918 patterns.
    '172.15.0.1',
    '172.32.0.1',
    '192.169.0.1',
    '11.0.0.1',
  ])('accepts %s', (host) => {
    expect(isUnreachableHost(host)).toBe(false);
  });

  it('does not match a public host that merely contains a private range', () => {
    expect(isUnreachableHost('my-10.0.0.1-app.com')).toBe(false);
    expect(isUnreachableHost('localhost.evil.com')).toBe(false);
  });
});

describe('describeAppUrlProblem', () => {
  it('says nothing outside production, where a LAN address is the point', () => {
    expect(describeAppUrlProblem('http://192.168.29.197:3000', 'development')).toBeNull();
    expect(describeAppUrlProblem('http://localhost:3000', 'test')).toBeNull();
  });

  it('rejects a LAN address in production', () => {
    const problem = describeAppUrlProblem('http://192.168.29.197:3000', 'production');
    expect(problem).toContain('192.168.29.197');
    expect(problem).toContain('only resolves on your own machine');
  });

  it('rejects localhost in production', () => {
    expect(describeAppUrlProblem('http://localhost:3000', 'production')).toContain('localhost');
  });

  it('rejects plain http on a public host', () => {
    const problem = describeAppUrlProblem('http://takeaway.example.com', 'production');
    expect(problem).toContain('https');
  });

  it('rejects a malformed URL', () => {
    expect(describeAppUrlProblem('not a url', 'production')).toContain('not a valid URL');
  });

  it('accepts a real https deployment', () => {
    expect(describeAppUrlProblem('https://projectta.vercel.app', 'production')).toBeNull();
    expect(describeAppUrlProblem('https://order.takeaway.in', 'production')).toBeNull();
  });
});

describe('appUrlSeverity', () => {
  it('is fatal on a real Vercel production deployment', () => {
    expect(appUrlSeverity({ vercelEnv: 'production' })).toBe('fatal');
  });

  it('is fatal on a self-hosted deployment that opts in', () => {
    expect(appUrlSeverity({ deployed: '1' })).toBe('fatal');
  });

  it('only warns for a local production build', () => {
    // `next build` on a laptop, testing the optimised bundle over Wi-Fi.
    expect(appUrlSeverity({})).toBe('warn');
  });

  it('only warns on preview deployments', () => {
    // Preview URLs are throwaway and nobody prints posters from them.
    expect(appUrlSeverity({ vercelEnv: 'preview' })).toBe('warn');
  });
});
