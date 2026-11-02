import { Platform, View, type ViewProps } from 'react-native';

import type { TextDirection } from './languages';

/**
 * A View whose children lay out in `dir` whatever the language direction.
 * Native uses the `direction` style; react-native-web ignores that style and
 * takes the HTML `dir` attribute instead. Use it for things that are spatial,
 * not text: card faces, the hand fan, the table with its seats.
 */
export function DirectionView({ dir, style, ...props }: ViewProps & { dir: TextDirection }) {
  if (Platform.OS === 'web') {
    // `dir` is a react-native-web View prop missing from the native ViewProps type.
    const webProps = { dir } as object;
    return <View {...props} {...webProps} style={style} />;
  }
  return <View {...props} style={[style, { direction: dir }]} />;
}
