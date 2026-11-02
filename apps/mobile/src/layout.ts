import { useWindowDimensions } from 'react-native';

/**
 * Desktop is the default; the phone layout is only for small screens.
 * Below this width (phones, small tablets in portrait) screens stack vertically.
 */
export const DESKTOP_MIN_WIDTH = 900;

export function isDesktopLayout(width: number): boolean {
  return width >= DESKTOP_MIN_WIDTH;
}

export function useLayout(): { desktop: boolean; width: number; height: number } {
  const { width, height } = useWindowDimensions();
  return { desktop: isDesktopLayout(width), width, height };
}
