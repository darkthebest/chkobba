import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useT } from '@/i18n';
import { useSkin } from '@/skins';

import { LobbyIcon, type LobbyIconName } from './LobbyIcons';

interface LobbyTileProps {
  title: string;
  subtitle?: string;
  icon: LobbyIconName;
  /** Primary tiles are large and filled with the accent colour. */
  primary?: boolean;
  /** Not available yet (online features): shown dimmed with a "Soon" badge. */
  soon?: boolean;
  /** A count shown in a small pill on the tile (e.g. friend requests); hidden when 0 or unset. */
  badge?: number;
  /** What the badge means, read with the title by screen readers (e.g. "3 friend requests"). */
  badgeLabel?: string;
  onPress?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function LobbyTile({ title, subtitle, icon, primary, soon, badge, badgeLabel, onPress, testID, style }: LobbyTileProps) {
  const { skin } = useSkin();
  const c = skin.tokens.colors;
  const f = skin.tokens.fonts;
  const tr = useT();
  const fg = primary && !soon ? c.onAccent : c.segmentText;
  const count = !soon && badge && badge > 0 ? badge : 0;
  const label = soon
    ? tr('lobby.comingSoon', { title })
    : count > 0 && badgeLabel
      ? tr('lobby.tileWithBadge', { title, badge: badgeLabel })
      : title;

  return (
    <Pressable
      onPress={soon ? undefined : onPress}
      disabled={soon}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!soon }}
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.tile,
        primary ? styles.primary : styles.small,
        {
          borderRadius: skin.tokens.radii.button,
          backgroundColor: primary && !soon ? c.accent : c.segmentBg,
          borderColor: primary && !soon ? c.accent : c.segmentBorder,
        },
        soon && styles.soon,
        pressed && !soon && styles.pressed,
        style,
      ]}
    >
      <View style={styles.text}>
        <Text style={[primary ? styles.titleBig : styles.title, { color: fg, fontFamily: f.display }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: fg, fontFamily: f.body }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.iconWrap, { backgroundColor: primary && !soon ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)' }]}>
        <LobbyIcon name={icon} color={fg} size={primary ? 26 : 22} />
      </View>
      {soon ? (
        <View style={[styles.badge, { backgroundColor: c.tagBg }]}>
          <Text style={[styles.badgeText, { color: c.tagText, fontFamily: f.bodyBold }]}>{tr('lobby.soon')}</Text>
        </View>
      ) : null}
      {count > 0 ? (
        <View
          style={[styles.countBadge, { backgroundColor: c.accent, borderColor: c.segmentBg }]}
          testID={testID ? `${testID}-badge` : undefined}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={[styles.countText, { color: c.onAccent, fontFamily: f.bodyBold }]}>
            {count > 9 ? '9+' : String(count)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5 },
  primary: { minHeight: 96, paddingHorizontal: 20, paddingVertical: 16 },
  small: { minHeight: 76, paddingHorizontal: 12, paddingVertical: 12 },
  soon: { opacity: 0.55 },
  pressed: { transform: [{ scale: 0.98 }] },
  text: { flexGrow: 1, flexShrink: 1, minWidth: 0, alignSelf: 'stretch' },
  titleBig: { fontSize: 22 },
  title: { fontSize: 15, lineHeight: 18 },
  subtitle: { fontSize: 12, opacity: 0.8, marginTop: 2 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -8, end: 10, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 },
  countBadge: {
    position: 'absolute',
    top: -8,
    end: 10,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 11, lineHeight: 14 },
  badgeText: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
});
