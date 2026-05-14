export const DEFAULT_AVATAR_URL = '/images/default-avatar.svg';

const LEGACY_DEFAULT_AVATAR_HOST = 'ui-avatars.com/api/';

export function isDefaultAvatarUrl(value: string | null | undefined): boolean {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    return true;
  }

  return normalized === DEFAULT_AVATAR_URL
    || normalized.endsWith(DEFAULT_AVATAR_URL)
    || normalized.includes(LEGACY_DEFAULT_AVATAR_HOST);
}

export function normalizeProfileImageUrl(value: string | null | undefined): string {
  const normalized = value?.trim() ?? '';
  return isDefaultAvatarUrl(normalized) ? DEFAULT_AVATAR_URL : normalized;
}
