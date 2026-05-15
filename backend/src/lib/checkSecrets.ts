export const DEFAULT_JWT_SECRET = 'your_jwt_secret_key';
export const DEFAULT_STREAM_SECRET = 'nostreamsecret';

export interface SecretCheckEnv {
  NODE_ENV?: string;
  JWT_SECRET?: string;
  STREAM_SECRET?: string;
  [key: string]: string | undefined;
}

/**
 * In production, refuse to run with the documented dev-default secrets.
 * Returns the list of env vars that are weak (empty when safe).
 */
export function findWeakSecrets(env: SecretCheckEnv): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const weak: string[] = [];
  if (!env.JWT_SECRET || env.JWT_SECRET === DEFAULT_JWT_SECRET) {
    weak.push('JWT_SECRET');
  }
  if (!env.STREAM_SECRET || env.STREAM_SECRET === DEFAULT_STREAM_SECRET) {
    weak.push('STREAM_SECRET');
  }
  return weak;
}
