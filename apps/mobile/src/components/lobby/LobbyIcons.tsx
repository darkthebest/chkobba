import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type LobbyIconName =
  | 'bolt'
  | 'cards'
  | 'plus'
  | 'friends'
  | 'trophy'
  | 'gear'
  | 'close'
  | 'help'
  | 'sound'
  | 'soundOff'
  | 'crown'
  | 'bot'
  | 'palette';

/** Simple stroke icons on a 24×24 grid, drawn in the given colour. */
export function LobbyIcon({ name, size = 24, color }: { name: LobbyIconName; size?: number; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'bolt' ? <Path d="M13 2 4 14h7l-1 8 9-12h-7z" {...stroke} /> : null}
      {name === 'cards' ? (
        <>
          <Rect x="3" y="6" width="11" height="15" rx="2" {...stroke} transform="rotate(-10 8.5 13.5)" />
          <Rect x="10" y="4" width="11" height="15" rx="2" {...stroke} transform="rotate(8 15.5 11.5)" />
        </>
      ) : null}
      {name === 'plus' ? <Path d="M12 5v14M5 12h14" {...stroke} /> : null}
      {name === 'friends' ? (
        <>
          <Circle cx="9" cy="8" r="3.5" {...stroke} />
          <Path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" {...stroke} />
          <Circle cx="17" cy="9" r="2.8" {...stroke} />
          <Path d="M17.5 14.6c2.2.4 3.6 2 4 4.6" {...stroke} />
        </>
      ) : null}
      {name === 'trophy' ? (
        <>
          <Path d="M8 4h8v5a4 4 0 0 1-8 0z" {...stroke} />
          <Path d="M8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 21h8M9.5 17h5" {...stroke} />
        </>
      ) : null}
      {name === 'gear' ? (
        <>
          <Circle cx="12" cy="12" r="3" {...stroke} />
          <Path
            d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"
            {...stroke}
          />
        </>
      ) : null}
      {name === 'help' ? (
        <>
          <Circle cx="12" cy="12" r="9" {...stroke} />
          <Path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" {...stroke} />
          <Circle cx="12" cy="17" r="0.6" fill={color} stroke={color} />
        </>
      ) : null}
      {name === 'close' ? <Path d="M6 6l12 12M18 6 6 18" {...stroke} /> : null}
      {name === 'sound' || name === 'soundOff' ? <Path d="M4 9h4l5-4v14l-5-4H4z" {...stroke} /> : null}
      {name === 'sound' ? <Path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" {...stroke} /> : null}
      {name === 'soundOff' ? <Path d="M16.5 9.5l5 5M21.5 9.5l-5 5" {...stroke} /> : null}
      {name === 'crown' ? <Path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5zM5 19h14" {...stroke} /> : null}
      {name === 'palette' ? (
        <>
          <Path d="M12 3a9 9 0 1 0 0 18c1.7 0 2.5-1 2-2.2-.5-1.3.4-2.8 1.9-2.8H18a3 3 0 0 0 3-3c0-5.5-4-10-9-10z" {...stroke} />
          <Circle cx="7.5" cy="10" r="1" fill={color} stroke="none" />
          <Circle cx="12" cy="7" r="1" fill={color} stroke="none" />
          <Circle cx="16.5" cy="10" r="1" fill={color} stroke="none" />
        </>
      ) : null}
      {name === 'bot' ? (
        <>
          <Rect x="4" y="8" width="16" height="12" rx="3" {...stroke} />
          <Path d="M12 4v4M9 13v1.5M15 13v1.5M9.5 17h5" {...stroke} />
          <Circle cx="12" cy="3.5" r="1" {...stroke} />
        </>
      ) : null}
    </Svg>
  );
}
