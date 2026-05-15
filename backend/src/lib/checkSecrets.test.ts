import { describe, it, expect } from 'vitest';
import {
  DEFAULT_JWT_SECRET,
  DEFAULT_STREAM_SECRET,
  findWeakSecrets,
} from './checkSecrets';

describe('findWeakSecrets', () => {
  it('returns nothing outside of production, even with weak secrets', () => {
    expect(
      findWeakSecrets({
        NODE_ENV: 'development',
        JWT_SECRET: DEFAULT_JWT_SECRET,
        STREAM_SECRET: DEFAULT_STREAM_SECRET,
      })
    ).toEqual([]);
  });

  it('flags missing secrets in production', () => {
    expect(findWeakSecrets({ NODE_ENV: 'production' })).toEqual([
      'JWT_SECRET',
      'STREAM_SECRET',
    ]);
  });

  it('flags default-value secrets in production', () => {
    expect(
      findWeakSecrets({
        NODE_ENV: 'production',
        JWT_SECRET: DEFAULT_JWT_SECRET,
        STREAM_SECRET: DEFAULT_STREAM_SECRET,
      })
    ).toEqual(['JWT_SECRET', 'STREAM_SECRET']);
  });

  it('accepts strong custom secrets in production', () => {
    expect(
      findWeakSecrets({
        NODE_ENV: 'production',
        JWT_SECRET: 'k7P3qLm9XbA2yN8fR5wH0sV6tCgJzD4u',
        STREAM_SECRET: 'rTpQ9wN3xK7mFvB2zH8sLgY4cD5jE6uM',
      })
    ).toEqual([]);
  });

  it('flags only the weak ones when partially overridden', () => {
    expect(
      findWeakSecrets({
        NODE_ENV: 'production',
        JWT_SECRET: 'strong-actual-secret',
        STREAM_SECRET: DEFAULT_STREAM_SECRET,
      })
    ).toEqual(['STREAM_SECRET']);
  });
});
