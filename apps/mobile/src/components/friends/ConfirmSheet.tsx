import { StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { useSkin } from '@/skins';

import { LobbySheet } from '../lobby/LobbySheet';
import { FriendButton } from './FriendButton';

export interface ConfirmSheetProps {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Draws the confirm button in the warning colours (Block). */
  destructive?: boolean;
  testID?: string;
}

/** A yes/no question over the friends screen (Remove, Block), built on the lobby sheet. */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = false,
  testID = 'friends-confirm',
}: ConfirmSheetProps) {
  const t = useSkin().skin.tokens;
  const tr = useT();
  return (
    <LobbySheet title={title} onClose={onCancel} testID={testID}>
      <Text style={[styles.body, { color: t.colors.panelText, fontFamily: t.fonts.body }]} testID={`${testID}-body`}>
        {body}
      </Text>
      <View style={styles.actions}>
        <FriendButton label={tr('friends.confirm.cancel')} onPress={onCancel} grow testID={`${testID}-cancel`} />
        <FriendButton
          label={confirmLabel}
          onPress={onConfirm}
          tone={destructive ? 'danger' : 'primary'}
          grow
          testID={`${testID}-ok`}
        />
      </View>
    </LobbySheet>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 10 },
});
