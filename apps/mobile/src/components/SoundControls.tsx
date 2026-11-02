import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { SOUND_LEVELS, useSound } from '@/audio/soundContext';
import { useT } from '@/i18n';
import { useSkin } from '@/skins';

import { LobbyIcon } from './lobby/LobbyIcons';
import { LobbySheet } from './lobby/LobbySheet';
import { Segmented } from './Segmented';

interface LevelRowProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  dimmed: boolean;
  testID: string;
}

/** A volume picker: an off button and rising bars, one per step. Works the same on touch, mouse and screen readers. */
function LevelRow({ label, value, onChange, dimmed, testID }: LevelRowProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  const step = Math.round(value * SOUND_LEVELS);
  const set = (next: number) => onChange(Math.min(SOUND_LEVELS, Math.max(0, next)) / SOUND_LEVELS);

  return (
    <View style={[styles.levelRow, dimmed && styles.dimmed]}>
      <Text style={[styles.label, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]}>{label}</Text>
      <View
        style={styles.bars}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: SOUND_LEVELS, now: step, text: step === 0 ? tr('sound.off') : tr('sound.level', { level: step, max: SOUND_LEVELS }) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => set(step + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
        testID={testID}
      >
        <Pressable onPress={() => set(0)} hitSlop={6} style={styles.off} testID={`${testID}-0`}>
          <LobbyIcon name={step === 0 ? 'soundOff' : 'sound'} color={step === 0 ? t.colors.panelMuted : t.colors.panelText} size={22} />
        </Pressable>
        {Array.from({ length: SOUND_LEVELS }, (_, i) => i + 1).map((n) => (
          <Pressable key={n} onPress={() => set(n)} hitSlop={4} style={styles.barHit} testID={`${testID}-${n}`}>
            <View
              style={[
                styles.bar,
                {
                  height: 8 + n * 6,
                  backgroundColor: n <= step ? t.colors.accent : t.colors.segmentBg,
                  borderColor: n <= step ? t.colors.accent : t.colors.segmentBorder,
                },
              ]}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Sound effects and background levels plus a mute switch; shared by Settings and the in-game sound sheet. */
export function SoundControls() {
  const { settings, setSettings } = useSound();
  const { skin } = useSkin();
  const tr = useT();
  return (
    <View style={styles.controls}>
      <Segmented
        value={settings.muted ? 'muted' : 'on'}
        onChange={(v) => setSettings({ muted: v === 'muted' })}
        testID="sound-mute"
        options={[
          { value: 'on', label: tr('sound.on') },
          { value: 'muted', label: tr('sound.muted') },
        ]}
      />
      <LevelRow
        label={tr('sound.effects')}
        value={settings.effects}
        onChange={(effects) => setSettings({ effects })}
        dimmed={settings.muted}
        testID="sound-effects"
      />
      {/* Only table styles with a background loop offer its level. */}
      {skin.ambience !== undefined ? (
        <LevelRow
          label={tr('sound.ambience')}
          value={settings.ambience}
          onChange={(ambience) => setSettings({ ambience })}
          dimmed={settings.muted}
          testID="sound-ambience"
        />
      ) : null}
    </View>
  );
}

/** The table's speaker button: shows whether sound is on and opens the sound sheet without leaving the game. */
export function SoundButton() {
  const [open, setOpen] = useState(false);
  const { settings } = useSound();
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  const silent = settings.muted || (settings.effects === 0 && settings.ambience === 0);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={tr('sound.open')}
        hitSlop={8}
        style={[styles.button, { borderColor: t.colors.segmentBorder, backgroundColor: t.colors.segmentBg }]}
        testID="sound-button"
      >
        <LobbyIcon name={silent ? 'soundOff' : 'sound'} color={silent ? t.colors.textMuted : t.colors.text} size={18} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <LobbySheet title={tr('sound.title')} onClose={() => setOpen(false)} testID="sound-sheet">
          <SoundControls />
        </LobbySheet>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  controls: { gap: 16 },
  levelRow: { gap: 8 },
  dimmed: { opacity: 0.45 },
  label: { fontSize: 13 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  off: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  barHit: { width: 32, height: 34, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: 22, borderRadius: 4, borderWidth: 1.5 },
  button: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
