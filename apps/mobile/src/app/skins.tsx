import type { Card, Suit } from '@chkobba/rules';
import { createDeck, makeCard, RANKS, SUITS } from '@chkobba/rules';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import {
  BOX_PRICES,
  DECKS,
  DeckCardBack,
  DeckCardFace,
  DeckPattern,
  MATCH_WIN_COINS,
  RARITY_ORDER,
  RARITY_WEIGHTS,
  useDeck,
  type BoxCount,
  type BoxOpening,
  type BoxResult,
  type DeckRarity,
  type DeckTheme,
} from '@/decks';
import { useT } from '@/i18n';
import { useLayout } from '@/layout';
import { useSkin } from '@/skins';

const SAMPLE_CARD: Card = { id: '7D', rank: '7', suit: 'D' };
const TOTAL_DECKS = DECKS.length;

const SUIT_META: Record<Suit, { glyph: string; nameKey: 'vault.suitD' | 'vault.suitS' | 'vault.suitH' | 'vault.suitC'; red: boolean }> = {
  D: { glyph: '♦', nameKey: 'vault.suitD', red: true },
  H: { glyph: '♥', nameKey: 'vault.suitH', red: true },
  S: { glyph: '♠', nameKey: 'vault.suitS', red: false },
  C: { glyph: '♣', nameKey: 'vault.suitC', red: false },
};

interface PlaytestSample {
  table: Card[];
  hand: Card[];
  opponent: Card[];
  captured: number;
}

function dealPlaytestSample(): PlaytestSample {
  const pool = createDeck();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return {
    table: pool.slice(0, 4),
    hand: pool.slice(4, 7),
    opponent: pool.slice(7, 10),
    captured: 10 + Math.floor(Math.random() * 25),
  };
}

const C = {
  bg: '#070b10',
  panel: '#0f1721',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.14)',
  text: '#e9eef4',
  heading: '#f3ecdd',
  muted: '#8d9caa',
  gold: '#e8c268',
  goldBorder: 'rgba(232,194,104,0.45)',
  danger: '#ff9d9d',
  green: '#86d9b4',
} as const;

const RARITY_COLOR: Record<DeckRarity, string> = {
  common: '#9aa7b6',
  rare: '#4f9cf9',
  epic: '#b06cff',
  mythic: '#ffb547',
};

const RARITY_PILL: Record<DeckRarity, { color: string; bg: string; border: string }> = {
  common: { color: '#d3dde8', bg: 'rgba(154,167,182,0.12)', border: 'rgba(154,167,182,0.32)' },
  rare: { color: '#bfe0ff', bg: 'rgba(79,156,249,0.12)', border: 'rgba(79,156,249,0.42)' },
  epic: { color: '#e4cbff', bg: 'rgba(176,108,255,0.13)', border: 'rgba(176,108,255,0.44)' },
  mythic: { color: '#ffe3b3', bg: 'rgba(255,181,71,0.13)', border: 'rgba(255,181,71,0.48)' },
};

const SPARK_COLORS = ['#e8c268', '#ffd75e', '#fff3d6', '#e8c268', '#ffd75e', '#fff3d6', '#e8c268', '#ffd75e', '#fff3d6', '#e8c268'];
const OPEN_MS = 820;

type Filter = 'all' | DeckRarity;

const exitToLobby = () => (router.canGoBack() ? router.back() : router.replace('/'));

const weightOf = (rarity: DeckRarity) => RARITY_WEIGHTS.find((entry) => entry.id === rarity)?.weight ?? 0;

/** `/skins`: the deck vault — boxes, odds, and the 20-deck collection. */
export default function SkinsScreen() {
  const { deckId, setDeck, coins, owned, ownedIds, opened, ready, openBox } = useDeck();
  const { desktop } = useLayout();
  const { skin } = useSkin();
  const fonts = skin.tokens.fonts;
  const tr = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const [reveal, setReveal] = useState<BoxOpening | null>(null);
  const [pendingBox, setPendingBox] = useState<BoxCount | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ownedUnique = useMemo(() => Object.keys(owned).length, [owned]);
  const broke = ready && coins < BOX_PRICES.one;

  const [shake] = useState(() => new Animated.Value(0));
  const [lid] = useState(() => new Animated.Value(0));
  const sparks = useMemo(
    () =>
      SPARK_COLORS.map((color, index) => {
        const angle = (index / SPARK_COLORS.length) * Math.PI * 2 + 0.35;
        const distance = 90 + (index % 4) * 34;
        return {
          color,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance - 26,
          value: new Animated.Value(0),
        };
      }),
    [],
  );

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const open = useCallback(
    (count: BoxCount) => {
      if (!ready || opening || coins < BOX_PRICES[count]) return;
      setOpening(true);
      Animated.parallel([
        Animated.sequence([
          Animated.timing(shake, { toValue: 1, duration: 110, useNativeDriver: true }),
          Animated.timing(shake, { toValue: -1, duration: 150, useNativeDriver: true }),
          Animated.timing(shake, { toValue: 0.7, duration: 160, useNativeDriver: true }),
          Animated.timing(shake, { toValue: -0.7, duration: 170, useNativeDriver: true }),
          Animated.timing(shake, { toValue: 0.4, duration: 150, useNativeDriver: true }),
          Animated.timing(shake, { toValue: 0, duration: 120, useNativeDriver: true }),
        ]),
        Animated.timing(lid, { toValue: 1, duration: 380, useNativeDriver: true }),
        ...sparks.map((spark, index) =>
          Animated.sequence([
            Animated.delay(index * 22),
            Animated.timing(spark.value, { toValue: 1, duration: 760, useNativeDriver: true }),
          ]),
        ),
      ]).start();
      timeoutRef.current = setTimeout(() => {
        const result = openBox(count);
        setOpening(false);
        shake.setValue(0);
        lid.setValue(0);
        sparks.forEach((spark) => spark.value.setValue(0));
        if (result) {
          setPendingBox(count);
          setReveal(result);
        }
      }, OPEN_MS);
    },
    [coins, lid, openBox, ready, shake, sparks, opening],
  );

  const filters = useMemo(
    () => [
      { id: 'all' as Filter, label: tr('vault.filterAll'), count: `${ownedUnique}/${TOTAL_DECKS}` },
      ...RARITY_ORDER.map((rarity) => ({
        id: rarity as Filter,
        label: tr(`skins.rarity.${rarity}`),
        count: `${DECKS.filter((deck) => deck.rarity === rarity && owned[deck.id] !== undefined).length}/${
          DECKS.filter((deck) => deck.rarity === rarity).length
        }`,
      })),
    ],
    [owned, ownedUnique, tr],
  );

  const visibleDecks = useMemo(
    () => (filter === 'all' ? DECKS : DECKS.filter((deck) => deck.rarity === filter)),
    [filter],
  );

  return (
    <View style={[styles.screen, { backgroundColor: C.bg }]}>
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={[styles.page, desktop && styles.pageDesktop]} testID="skins-screen">
          <View style={styles.topbar}>
            <View style={styles.brandBlock}>
              <Pressable
                onPress={exitToLobby}
                accessibilityRole="button"
                accessibilityLabel={tr('common.back')}
                testID="skins-back"
                style={({ pressed }) => [styles.back, pressed && styles.pressed]}
              >
                <Text style={[styles.backText, { color: C.muted, fontFamily: fonts.bodyBold }]}>‹</Text>
              </Pressable>
              <View style={styles.brandMark}>
                <Text style={[styles.brandDiamond, { color: C.gold, fontFamily: fonts.display }]}>♦</Text>
              </View>
              <View style={styles.brandCopy}>
                <Text style={[styles.title, { color: C.heading, fontFamily: fonts.display }]} accessibilityRole="header">
                  {tr('vault.title')}
                </Text>
                <Text style={[styles.tagline, { color: C.muted, fontFamily: fonts.body }]}>{tr('vault.tagline')}</Text>
              </View>
            </View>
            <View style={styles.stats}>
              <StatChip label={tr('vault.statBoxes')} value={`${opened}`} fonts={fonts} testID="vault-opened" />
              <StatChip label={tr('vault.statDecks')} value={`${ownedUnique}/${TOTAL_DECKS}`} fonts={fonts} testID="vault-found" />
              <StatChip label={tr('vault.statCoins')} value={`${coins}`} fonts={fonts} testID="vault-coins" />
            </View>
          </View>

          <View style={[styles.main, desktop && styles.mainDesktop]}>
            <View style={[styles.panel, styles.vaultPanel, desktop && styles.vaultPanelDesktop]}>
              <Text style={[styles.sectionTitle, { color: C.heading, fontFamily: fonts.display }]}>
                {tr('vault.openVault')}
              </Text>
              <ChestStage fonts={fonts} shake={shake} lid={lid} sparks={sparks} opening={opening} />

              <View style={styles.actions}>
                <BoxButton
                  count="one"
                  label={tr('vault.openOne')}
                  price={BOX_PRICES.one}
                  coins={coins}
                  ready={ready}
                  disabled={opening}
                  onPress={open}
                  fonts={fonts}
                  primary
                />
                <BoxButton
                  count="five"
                  label={tr('vault.openFive')}
                  price={BOX_PRICES.five}
                  coins={coins}
                  ready={ready}
                  disabled={opening}
                  onPress={open}
                  fonts={fonts}
                />
              </View>
              <Text
                style={[styles.priceNote, { color: broke ? C.danger : C.muted, fontFamily: fonts.body }]}
                testID={broke ? 'vault-short' : undefined}
              >
                {broke ? tr('vault.notEnough') : tr('vault.earn', { coins: MATCH_WIN_COINS })}
              </Text>

              <View style={[styles.odds, { borderTopColor: C.line }]}>
                <View style={styles.oddsHead}>
                  <Text style={[styles.oddsHeadText, { color: C.muted, fontFamily: fonts.bodyBold }]}>
                    {tr('vault.odds')}
                  </Text>
                  <Text style={[styles.oddsHeadText, { color: C.muted, fontFamily: fonts.bodyBold }]}>
                    {tr('vault.perBox')}
                  </Text>
                </View>
                {RARITY_ORDER.map((rarity) => (
                  <View key={rarity} style={styles.oddsRow}>
                    <View style={styles.oddsName}>
                      <View style={[styles.dot, { backgroundColor: RARITY_COLOR[rarity] }]} />
                      <Text style={[styles.oddsLabel, { color: '#dbe4ec', fontFamily: fonts.body }]}>
                        {tr(`skins.rarity.${rarity}`)}
                      </Text>
                    </View>
                    <Text style={[styles.oddsPct, { color: '#efe7d6', fontFamily: fonts.numeric }]}>
                      {weightOf(rarity)}%
                    </Text>
                    <View style={styles.oddsBar}>
                      <View
                        style={[styles.oddsFill, { width: `${weightOf(rarity)}%`, backgroundColor: RARITY_COLOR[rarity] }]}
                      />
                    </View>
                  </View>
                ))}
                <Text style={[styles.oddsNote, { color: C.muted, fontFamily: fonts.body }]}>{tr('vault.oddsNote')}</Text>
              </View>
            </View>

            <View style={[styles.panel, styles.collectionPanel]}>
              <View style={styles.collectionHead}>
                <View style={styles.collectionHeadCopy}>
                  <Text style={[styles.sectionTitle, { color: C.heading, fontFamily: fonts.display }]}>
                    {tr('vault.collectionTitle')}
                  </Text>
                  <Text style={[styles.progress, { color: C.muted, fontFamily: fonts.body }]}>
                    {tr('vault.progressLong', { owned: ownedUnique, total: TOTAL_DECKS })}
                  </Text>
                </View>
                <View style={styles.filters}>
                  {filters.map((entry) => {
                    const active = filter === entry.id;
                    const activeBg = entry.id === 'all' || entry.id === 'common' ? '#e7dcc0' : RARITY_COLOR[entry.id];
                    const activeText = entry.id === 'mythic' ? '#221102' : '#0d1218';
                    return (
                      <Pressable
                        key={entry.id}
                        onPress={() => setFilter(entry.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        testID={`filter-${entry.id}`}
                        style={({ pressed }) => [
                          styles.filter,
                          { borderColor: active ? activeBg : C.line },
                          active && { backgroundColor: activeBg },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterLabel,
                            { color: active ? activeText : C.muted, fontFamily: fonts.body },
                          ]}
                        >
                          {entry.label}
                        </Text>
                        <Text
                          style={[
                            styles.filterCount,
                            { color: active ? activeText : C.muted, fontFamily: fonts.bodyBold },
                          ]}
                        >
                          {entry.count}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.grid}>
                {visibleDecks.map((deck) => (
                  <DeckTile
                    key={deck.id}
                    deck={deck}
                    count={owned[deck.id] ?? 0}
                    equipped={deckId === deck.id}
                    rarityLabel={tr(`skins.rarity.${deck.rarity}`)}
                    lockedLabel={tr('vault.locked')}
                    equippedLabel={tr('vault.equipped')}
                    fonts={fonts}
                    desktop={desktop}
                    onEquip={() => setDeck(deck.id)}
                  />
                ))}
              </View>

              <View style={[styles.collectionFoot, { borderTopColor: C.line }]}>
                <Text style={[styles.dimNote, { color: C.muted, fontFamily: fonts.body }]}>{tr('vault.dimNote')}</Text>
                <View style={styles.footActions}>
                  <Pressable
                    onPress={() => setPreview(deckId ?? ownedIds[ownedIds.length - 1] ?? DECKS[0].id)}
                    accessibilityRole="button"
                    accessibilityLabel={tr('vault.previewCards')}
                    testID="open-preview"
                    style={({ pressed }) => [styles.tinyButton, { borderColor: C.lineStrong }, pressed && styles.pressed]}
                  >
                    <Text style={[styles.tinyButtonText, { color: C.text, fontFamily: fonts.bodyBold }]}>
                      {tr('vault.previewCards')}
                    </Text>
                  </Pressable>
                  {deckId !== null ? (
                    <Pressable
                      onPress={() => setDeck(null)}
                      accessibilityRole="button"
                      accessibilityLabel={tr('skins.tableDefault')}
                      testID="skin-default"
                      style={({ pressed }) => [styles.tinyButton, { borderColor: C.lineStrong }, pressed && styles.pressed]}
                    >
                      <Text style={[styles.tinyButtonText, { color: C.text, fontFamily: fonts.bodyBold }]}>
                        {tr('vault.useTable')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          </View>

          <Text style={[styles.footer, { color: '#6f7f8e', fontFamily: fonts.body }]}>{tr('vault.footerNote')}</Text>
        </ScrollView>

        <RevealModal
          reveal={reveal}
          pendingBox={pendingBox}
          coins={coins}
          ready={ready}
          onClose={() => setReveal(null)}
          onAgain={(count) => {
            setReveal(null);
            setTimeout(() => open(count), 180);
          }}
        />

        <PreviewModal initialDeck={preview} owned={owned} onClose={() => setPreview(null)} />
      </SafeAreaView>
    </View>
  );
}

function StatChip({
  label,
  value,
  fonts,
  testID,
}: {
  label: string;
  value: string;
  fonts: { display: string; body: string };
  testID: string;
}) {
  return (
    <View style={styles.stat} testID={testID}>
      <Text style={[styles.statValue, { color: '#f2ecdc', fontFamily: fonts.display }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: C.muted, fontFamily: fonts.body }]}>{label}</Text>
    </View>
  );
}

function BoxButton({
  count,
  label,
  price,
  coins,
  ready,
  disabled,
  onPress,
  fonts,
  primary,
}: {
  count: BoxCount;
  label: string;
  price: number;
  coins: number;
  ready: boolean;
  disabled: boolean;
  onPress: (count: BoxCount) => void;
  fonts: { body: string; bodyBold: string; numeric: string };
  primary?: boolean;
}) {
  const disabledNow = !ready || coins < price || disabled;
  return (
    <Pressable
      onPress={() => onPress(count)}
      disabled={disabledNow}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabledNow }}
      testID={count === 'one' ? 'open-one' : 'open-five'}
      style={({ pressed }) => [
        styles.boxButton,
        primary ? styles.boxButtonPrimary : styles.boxButtonPlain,
        disabledNow && styles.disabled,
        pressed && !disabledNow && styles.pressed,
      ]}
    >
      {primary ? (
        <LinearGradient
          colors={['#efce7f', '#c69a3c']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Text style={[styles.boxButtonLabel, { color: primary ? '#2a1d05' : '#e7edf4', fontFamily: fonts.bodyBold }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.pricePill,
          primary
            ? { borderColor: 'rgba(0,0,0,0.18)', backgroundColor: 'rgba(0,0,0,0.14)', color: '#2a1d05' }
            : { borderColor: C.line, backgroundColor: 'rgba(255,255,255,0.08)', color: '#f0e6cf' },
          { fontFamily: fonts.numeric },
        ]}
      >
        {price}
      </Text>
    </Pressable>
  );
}

function ChestStage({
  fonts,
  shake,
  lid,
  sparks,
  opening,
}: {
  fonts: { display: string };
  shake: Animated.Value;
  lid: Animated.Value;
  sparks: { color: string; dx: number; dy: number; value: Animated.Value }[];
  opening: boolean;
}) {
  const translateX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-7, 7] });
  const rotate = shake.interpolate({ inputRange: [-1, 1], outputRange: ['-2deg', '2deg'] });
  const lidTranslate = lid.interpolate({ inputRange: [0, 1], outputRange: [0, -58] });
  const lidRotate = lid.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-12deg'] });
  const lidOpacity = lid.interpolate({ inputRange: [0, 1], outputRange: [1, 0.15] });

  return (
    <View style={styles.stage}>
      <View style={[styles.glow, { opacity: opening ? 1 : 0.85 }]} />
      <Animated.View style={[styles.lootbox, { transform: [{ translateX }, { rotate }] }]}>
        <View style={styles.chestBody}>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <View key={index} style={[styles.plankLine, { left: 8 + index * 30 }]} />
          ))}
          <LinearGradient
            colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0)']}
            locations={[0, 0.3]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.strap, { left: 18 }]} />
          <View style={[styles.strap, { right: 18 }]} />
          <Text style={[styles.emblem, { color: C.gold, fontFamily: fonts.display }]}>♦</Text>
          <Text style={[styles.chestLabel, { fontFamily: fonts.display }]}>CHKOBBA</Text>
        </View>
        <Animated.View
          style={[
            styles.chestLid,
            { transform: [{ translateY: lidTranslate }, { rotate: lidRotate }], opacity: lidOpacity },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
            locations={[0, 0.46]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.lidLine} />
        </Animated.View>
        {sparks.map((spark, index) => {
          const opacity = spark.value.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] });
          const scale = spark.value.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.1] });
          return (
            <Animated.View
              key={index}
              style={[
                styles.spark,
                {
                  backgroundColor: spark.color,
                  opacity,
                  transform: [{ translateX: Animated.multiply(spark.value, spark.dx) }, { translateY: Animated.multiply(spark.value, spark.dy) }, { scale }],
                },
              ]}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}

function DeckTile({
  deck,
  count,
  equipped,
  rarityLabel,
  lockedLabel,
  equippedLabel,
  fonts,
  desktop,
  onEquip,
}: {
  deck: DeckTheme;
  count: number;
  equipped: boolean;
  rarityLabel: string;
  lockedLabel: string;
  equippedLabel: string;
  fonts: { display: string; body: string; bodyBold: string };
  desktop: boolean;
  onEquip: () => void;
}) {
  const owned = count > 0;
  const pill = RARITY_PILL[deck.rarity];
  return (
    <Pressable
      onPress={onEquip}
      disabled={!owned}
      accessibilityRole="button"
      accessibilityState={{ selected: equipped, disabled: !owned }}
      accessibilityLabel={`${deck.name}, ${rarityLabel}`}
      testID={`skin-${deck.id}`}
      style={({ pressed }) => [
        styles.deckCard,
        desktop ? styles.deckCardDesktop : styles.deckCardPhone,
        { borderTopColor: RARITY_COLOR[deck.rarity] },
        equipped && { borderColor: C.gold, borderTopColor: C.gold },
        pressed && owned && styles.pressed,
      ]}
    >
      <View style={[styles.deckArt, { backgroundColor: deck.b }]}>
        <LinearGradient
          colors={[deck.a, deck.b]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <DeckPattern id={`tile-${deck.id}`} pattern={deck.pattern} color={deck.accent} opacity={0.55} />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.42)']}
          locations={[0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.previewRow}>
          <View style={[styles.previewFaceBox, { borderColor: deck.accent }]}>
            <View style={styles.previewFaceScale}>
              <DeckCardFace deck={deck} card={SAMPLE_CARD} size="md" />
            </View>
          </View>
          <DeckCardBack deck={deck} width={44} height={62} />
        </View>
        {!owned ? <View style={styles.lockDim} /> : null}
      </View>
      <Text style={[styles.deckName, { color: '#f1eadb', fontFamily: fonts.display }]} numberOfLines={1}>
        {deck.name}
      </Text>
      <View style={styles.deckMeta}>
        <View style={[styles.pill, { backgroundColor: pill.bg, borderColor: pill.border }]}>
          <Text style={[styles.pillText, { color: pill.color, fontFamily: fonts.bodyBold }]}>{rarityLabel}</Text>
        </View>
        {equipped ? (
          <Text style={[styles.deckState, { color: C.gold, fontFamily: fonts.bodyBold }]}>{equippedLabel}</Text>
        ) : owned ? (
          <Text style={[styles.deckCount, { color: RARITY_COLOR[deck.rarity], fontFamily: fonts.bodyBold }]}>
            ×{count}
          </Text>
        ) : (
          <Text style={[styles.deckState, { color: '#70808f', fontFamily: fonts.body }]}>{lockedLabel}</Text>
        )}
      </View>
    </Pressable>
  );
}

function RevealModal({
  reveal,
  pendingBox,
  coins,
  ready,
  onClose,
  onAgain,
}: {
  reveal: BoxOpening | null;
  pendingBox: BoxCount | null;
  coins: number;
  ready: boolean;
  onClose: () => void;
  onAgain: (count: BoxCount) => void;
}) {
  const [pop] = useState(() => new Animated.Value(0));
  const tr = useT();
  const fonts = useSkin().skin.tokens.fonts;
  useEffect(() => {
    if (reveal) {
      pop.setValue(0);
      Animated.timing(pop, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    }
  }, [pop, reveal]);
  if (!reveal || pendingBox === null) return null;

  const single = reveal.results.length === 1;
  const againPrice = BOX_PRICES[pendingBox];
  const canAgain = ready && coins >= againPrice;
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  const translateY = pop.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.modalCard, { opacity: pop, transform: [{ translateY }, { scale }] }]}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={tr('common.close')}
            testID="vault-close"
            style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
          >
            <Text style={styles.modalCloseText}>×</Text>
          </Pressable>
          {single ? <SingleReveal result={reveal.results[0]} /> : <SummaryReveal results={reveal.results} />}
          <View style={styles.modalActions}>
            <Pressable
              onPress={() => onAgain(pendingBox)}
              disabled={!canAgain}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAgain }}
              testID={pendingBox === 'one' ? 'vault-again' : 'vault-again-five'}
              style={({ pressed }) => [
                styles.againButton,
                !canAgain && styles.disabled,
                pressed && canAgain && styles.pressed,
              ]}
            >
              <LinearGradient
                colors={['#efce7f', '#c69a3c']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={[styles.againText, { color: '#2a1d05', fontFamily: fonts.bodyBold }]}>
                {pendingBox === 'one' ? tr('vault.openAnother') : tr('vault.openFiveMore')}
              </Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              testID="vault-collect"
              style={({ pressed }) => [styles.collectButton, pressed && styles.pressed]}
            >
              <Text style={[styles.collectText, { color: '#e7edf4', fontFamily: fonts.bodyBold }]}>
                {tr('vault.done')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function SingleReveal({ result }: { result: BoxResult }) {
  const { deck } = result;
  const pill = RARITY_PILL[deck.rarity];
  const fonts = useSkin().skin.tokens.fonts;
  const tr = useT();
  return (
    <View style={styles.reveal}>
      <Text style={[styles.kicker, { color: C.muted, fontFamily: fonts.bodyBold }]}>
        {result.duplicate ? tr('vault.duplicateFound') : tr('vault.newDeck')}
      </Text>
      <View style={[styles.revealArt, { backgroundColor: deck.b, borderColor: RARITY_COLOR[deck.rarity] }]}>
        <LinearGradient
          colors={[deck.a, deck.b]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <DeckPattern id={`reveal-${deck.id}`} pattern={deck.pattern} color={deck.accent} opacity={0.55} />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
          locations={[0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.revealRow}>
          <View style={[styles.revealFaceBox, { borderColor: deck.accent }]}>
            <View style={styles.revealFaceScale}>
              <DeckCardFace deck={deck} card={SAMPLE_CARD} size="lg" />
            </View>
          </View>
          <DeckCardBack deck={deck} width={62} height={88} />
        </View>
      </View>
      <View style={[styles.pill, { backgroundColor: pill.bg, borderColor: pill.border, alignSelf: 'center' }]}>
        <Text style={[styles.pillText, { color: pill.color, fontFamily: fonts.bodyBold }]}>
          {tr(`skins.rarity.${deck.rarity}`)} · {weightOf(deck.rarity)}%
        </Text>
      </View>
      <Text style={[styles.revealName, { color: '#f6f0e2', fontFamily: fonts.display }]}>{deck.name}</Text>
      <Text style={[styles.revealFlavor, { color: '#aebbc8', fontFamily: fonts.body }]}>{deck.flavor}</Text>
      <Text style={[styles.dupeline, { color: result.duplicate ? C.green : C.gold, fontFamily: fonts.body }]}>
        {result.duplicate
          ? tr('vault.refundOne', { coins: result.refund })
          : tr('vault.addedLine')}
      </Text>
    </View>
  );
}

function SummaryReveal({ results }: { results: BoxResult[] }) {
  const fonts = useSkin().skin.tokens.fonts;
  const tr = useT();
  const totalRefund = results.reduce((sum, result) => sum + result.refund, 0);
  const newCount = results.filter((result) => !result.duplicate).length;
  const dupeCount = results.length - newCount;
  return (
    <View style={styles.summary}>
      <Text style={[styles.summaryTitle, { color: '#f6f0e2', fontFamily: fonts.display }]}>
        {tr('vault.vaultsOpened', { count: results.length })}
      </Text>
      <Text style={[styles.summaryCounts, { color: C.muted, fontFamily: fonts.body }]}>
        {tr('vault.revealSummary', { newCount, dupeCount })}
      </Text>
      <View style={styles.resultList}>
        {results.map((result, index) => (
          <View
            key={`${result.deck.id}-${index}`}
            style={[styles.resultRow, { borderLeftColor: RARITY_COLOR[result.deck.rarity] }]}
          >
            <View style={[styles.resultSwatch, { backgroundColor: result.deck.b }]}>
              <LinearGradient
                colors={[result.deck.a, result.deck.b]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <DeckPattern
                id={`swatch-${result.deck.id}-${index}`}
                pattern={result.deck.pattern}
                color={result.deck.accent}
                opacity={0.5}
              />
              <Text style={[styles.swatchEmblem, { color: result.deck.accent, fontFamily: fonts.display }]}>♦</Text>
            </View>
            <View style={styles.resultInfo}>
              <Text style={[styles.resultName, { color: '#f0e9da', fontFamily: fonts.display }]} numberOfLines={1}>
                {result.deck.name}
              </Text>
              <Text style={[styles.resultMeta, { color: RARITY_COLOR[result.deck.rarity], fontFamily: fonts.bodyBold }]}>
                {tr(`skins.rarity.${result.deck.rarity}`)} · {weightOf(result.deck.rarity)}%
              </Text>
            </View>
            <View style={[styles.resultTag, result.duplicate ? styles.tagDupe : styles.tagNew]}>
              <Text
                style={[
                  styles.resultTagText,
                  { color: result.duplicate ? C.muted : '#2a1d05', fontFamily: fonts.bodyBold },
                ]}
              >
                {result.duplicate ? tr('vault.duplicate') : tr('vault.new')}
              </Text>
            </View>
          </View>
        ))}
      </View>
      {totalRefund > 0 ? (
        <View style={styles.summaryTotal}>
          <Text style={{ color: C.green, fontSize: 12, fontFamily: fonts.body }}>
            {tr('vault.refundTotal', { coins: totalRefund })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Card playtest: a mock table plus the full 40-card deck for one deck skin. */
function PreviewModal({
  initialDeck,
  owned,
  onClose,
}: {
  initialDeck: string | null;
  owned: Readonly<Record<string, number>>;
  onClose: () => void;
}) {
  const tr = useT();
  const fonts = useSkin().skin.tokens.fonts;
  const [deckId, setDeckId] = useState(() => initialDeck ?? DECKS[0].id);
  const [sample, setSample] = useState<PlaytestSample>(() => dealPlaytestSample());
  const deck = DECKS.find((entry) => entry.id === deckId) ?? DECKS[0];
  if (!initialDeck) return null;
  const count = owned[deck.id] ?? 0;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, styles.playtestCard]}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={tr('common.close')}
            testID="preview-close"
            style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
          >
            <Text style={styles.modalCloseText}>×</Text>
          </Pressable>
          <ScrollView showsVerticalScrollIndicator={false}>

          <View style={styles.playtestHead}>
            <View style={styles.playtestHeadCopy}>
              <Text style={[styles.kicker, { color: C.muted, fontFamily: fonts.bodyBold }]}>
                {tr('vault.playtestKicker')}
              </Text>
              <Text style={[styles.playtestTitle, { color: '#f6f0e2', fontFamily: fonts.display }]}>{deck.name}</Text>
              <Text style={[styles.playtestMeta, { color: C.muted, fontFamily: fonts.body }]}>
                {count > 0
                  ? tr('vault.ownedPreviewLine', { count })
                  : tr('vault.lockedPreviewLine')}
              </Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow} testID="preview-picker">
            {DECKS.map((entry) => {
              const active = entry.id === deck.id;
              const ownedEntry = (owned[entry.id] ?? 0) > 0;
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => setDeckId(entry.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  testID={`preview-chip-${entry.id}`}
                  style={({ pressed }) => [
                    styles.pickerChip,
                    { borderColor: active ? C.gold : C.line },
                    active && { backgroundColor: 'rgba(232,194,104,0.14)' },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.pickerChipText,
                      { color: active ? C.gold : C.text, fontFamily: fonts.bodyBold },
                    ]}
                  >
                    {entry.name}
                    {ownedEntry ? ' ✓' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.playtestSurface}>
            <View style={styles.ptCenterRow}>
              <Text style={[styles.ptLabel, { fontFamily: fonts.bodyBold }]}>{tr('vault.opponentHand')}</Text>
              <View style={styles.ptRow}>
                {sample.opponent.map((card) => (
                  <DeckCardBack key={card.id} deck={deck} width={38} height={53} />
                ))}
              </View>
            </View>

            <View style={styles.ptMiddle}>
              <View style={styles.ptStackBlock}>
                <View style={styles.ptStack}>
                  <View style={styles.ptStackCard}>
                    <DeckCardBack deck={deck} width={38} height={53} />
                  </View>
                  <View style={styles.ptStackCard}>
                    <DeckCardBack deck={deck} width={38} height={53} />
                  </View>
                  <DeckCardBack deck={deck} width={38} height={53} />
                </View>
                <Text style={[styles.ptLabel, { fontFamily: fonts.bodyBold }]}>
                  {tr('vault.captured', { count: sample.captured })}
                </Text>
              </View>
              <View style={styles.ptTableBlock}>
                <Text style={[styles.ptLabel, { fontFamily: fonts.bodyBold }]}>{tr('vault.tableLabel')}</Text>
                <View style={styles.ptRow}>
                  {sample.table.map((card) => (
                    <View key={card.id} style={styles.mdFaceBox}>
                      <DeckCardFace deck={deck} card={card} size="md" />
                    </View>
                  ))}
                  <DeckCardBack deck={deck} width={46} height={66} />
                </View>
              </View>
            </View>

            <View style={[styles.ptHand, { borderTopColor: C.line }]}>
              <Text style={[styles.ptLabel, { fontFamily: fonts.bodyBold }]}>{tr('vault.handLabel')}</Text>
              <View style={styles.ptRow}>
                {sample.hand.map((card) => (
                  <View key={card.id} style={styles.lgFaceBox}>
                    <DeckCardFace deck={deck} card={card} size="lg" />
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.playtestToolbar}>
            <Pressable
              onPress={() => setSample(dealPlaytestSample())}
              accessibilityRole="button"
              testID="preview-redeal"
              style={({ pressed }) => [styles.tinyButton, { borderColor: C.lineStrong }, pressed && styles.pressed]}
            >
              <Text style={[styles.tinyButtonText, { color: C.text, fontFamily: fonts.bodyBold }]}>
                {tr('vault.dealCards')}
              </Text>
            </Pressable>
            <Text style={[styles.playtestNote, { color: C.muted, fontFamily: fonts.body }]}>
              {tr('vault.previewNote')}
            </Text>
          </View>

          <View style={styles.playtestAll}>
            <View style={styles.playtestAllHead}>
              <Text style={[styles.playtestAllTitle, { color: '#eef3f8', fontFamily: fonts.display }]}>
                {tr('vault.fullDeck')}
              </Text>
              <Text style={[styles.playtestNote, { color: C.muted, fontFamily: fonts.body }]}>
                {tr('vault.fullDeckNote')}
              </Text>
            </View>
            {SUITS.map((suit) => {
              const meta = SUIT_META[suit];
              return (
                <View key={suit} style={[styles.ptSuit, { borderTopColor: C.line }]}>
                  <View style={styles.ptSuitHead}>
                    <Text style={{ color: meta.red ? '#ff9b8f' : '#dbe4ec', fontSize: 13, fontFamily: fonts.display }}>
                      {meta.glyph}
                    </Text>
                    <Text style={[styles.ptSuitName, { color: '#c9d5e0', fontFamily: fonts.bodyBold }]}>
                      {tr(meta.nameKey)}
                    </Text>
                    <Text style={[styles.ptSuitCount, { color: C.muted, fontFamily: fonts.body }]}>
                      {RANKS.length} cards
                    </Text>
                  </View>
                  <View style={styles.ptSuitCards}>
                    {RANKS.map((rank) => (
                      <View key={rank} style={styles.tinyFaceBox}>
                        <View style={styles.tinyFaceScale}>
                          <DeckCardFace deck={deck} card={makeCard(rank, suit)} size="md" />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  root: { flex: 1 },
  page: { flexGrow: 1, width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 20, paddingBottom: 44 },
  pageDesktop: { padding: 26 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  back: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 22, lineHeight: 26 },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.goldBorder,
    backgroundColor: '#2b1f08',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandDiamond: { fontSize: 22 },
  brandCopy: { flexShrink: 1, gap: 2 },
  title: { fontSize: 26 },
  tagline: { fontSize: 11, letterSpacing: 1.9, textTransform: 'uppercase' },
  stats: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  stat: {
    minWidth: 96,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'flex-end',
  },
  statValue: { fontSize: 20 },
  statLabel: { marginTop: 2, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  main: { gap: 22, marginTop: 22 },
  mainDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  panel: { borderRadius: 18, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  vaultPanel: { padding: 22, backgroundColor: C.panel },
  vaultPanelDesktop: { width: 430 },
  collectionPanel: { padding: 22, backgroundColor: C.panel, flex: 1 },
  sectionTitle: { fontSize: 21 },
  stage: { height: 250, alignItems: 'center', justifyContent: 'center', marginVertical: 18 },
  glow: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(232,194,104,0.16)' },
  lootbox: { width: 190, height: 156 },
  chestBody: {
    position: 'absolute',
    top: 34,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(232,194,104,0.38)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plankLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(0,0,0,0.22)' },
  strap: { position: 'absolute', top: 0, bottom: 0, width: 14, borderRadius: 3, backgroundColor: '#8a6427' },
  emblem: {
    fontSize: 40,
    textShadowColor: 'rgba(232,194,104,0.65)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  chestLabel: { position: 'absolute', bottom: 14, fontSize: 9, letterSpacing: 3.1, color: 'rgba(246,226,178,0.7)' },
  chestLid: {
    position: 'absolute',
    top: 14,
    left: -6,
    right: -6,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,194,104,0.5)',
    backgroundColor: '#5e3d17',
    overflow: 'hidden',
  },
  lidLine: {
    position: 'absolute',
    top: '50%',
    left: '30%',
    right: '30%',
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(232,194,104,0.55)',
  },
  spark: { position: 'absolute', top: '50%', left: '50%', width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5, borderRadius: 4 },
  actions: { flexDirection: 'row', gap: 10 },
  boxButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 8,
    overflow: 'hidden',
  },
  boxButtonPrimary: { borderColor: 'rgba(255,232,175,0.6)' },
  boxButtonPlain: { borderColor: C.lineStrong, backgroundColor: 'rgba(255,255,255,0.04)', flex: 0.9 },
  boxButtonLabel: { fontSize: 14 },
  pricePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, borderWidth: 1, fontSize: 11 },
  priceNote: { marginTop: 10, marginHorizontal: 2, fontSize: 11, lineHeight: 17 },
  odds: { marginTop: 18, paddingTop: 16, borderTopWidth: 1 },
  oddsHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  oddsHeadText: { fontSize: 11, letterSpacing: 1.9, textTransform: 'uppercase' },
  oddsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  oddsName: { width: 92, flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  oddsLabel: { fontSize: 13 },
  oddsPct: { width: 44, fontSize: 14, textAlign: 'right' },
  oddsBar: { flex: 1, height: 7, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  oddsFill: { height: '100%', borderRadius: 99, opacity: 0.85 },
  oddsNote: { marginTop: 10, fontSize: 11 },
  collectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 18,
  },
  collectionHeadCopy: { gap: 5 },
  progress: { fontSize: 12 },
  filters: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 99,
    borderWidth: 1,
  },
  filterLabel: { fontSize: 12 },
  filterCount: { fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  deckCard: {
    borderWidth: 1,
    borderTopWidth: 2,
    borderColor: C.line,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.035)',
    padding: 8,
  },
  deckCardPhone: { width: '47.5%' },
  deckCardDesktop: { width: '31%' },
  deckArt: {
    height: 150,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewFaceBox: {
    width: 60,
    height: 86,
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: '#fffdf7',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  previewFaceScale: { width: 46, height: 66, transform: [{ scale: 1.28 }] },
  lockDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,11,16,0.55)' },
  deckName: { marginTop: 9, paddingHorizontal: 4, fontSize: 14 },
  deckMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 4,
    paddingBottom: 3,
  },
  pill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, borderWidth: 1 },
  pillText: { fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' },
  deckState: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  deckCount: { fontSize: 11 },
  collectionFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  dimNote: { fontSize: 12, flexShrink: 1 },
  tinyButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tinyButtonText: { fontSize: 12 },
  footActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  playtestCard: { maxWidth: 760, paddingHorizontal: 22 },
  playtestHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  playtestHeadCopy: { flexShrink: 1, gap: 3 },
  playtestTitle: { fontSize: 24 },
  playtestMeta: { fontSize: 11 },
  pickerRow: { gap: 6, paddingVertical: 12, paddingRight: 12 },
  pickerChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  pickerChipText: { fontSize: 11 },
  playtestSurface: {
    marginTop: 4,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(120,200,170,0.18)',
    backgroundColor: '#0d2f29',
    gap: 14,
  },
  ptCenterRow: { alignItems: 'center', gap: 8 },
  ptRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  ptMiddle: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  ptStackBlock: { alignItems: 'center', gap: 8 },
  ptStack: { flexDirection: 'row' },
  ptStackCard: { marginLeft: -20 },
  ptTableBlock: { flex: 1, alignItems: 'center', gap: 8 },
  ptHand: { paddingTop: 14, borderTopWidth: 1, alignItems: 'center', gap: 8 },
  ptLabel: { fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(220,240,232,0.62)' },
  playtestToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 14 },
  playtestNote: { fontSize: 11, flexShrink: 1 },
  playtestAll: { marginTop: 20 },
  playtestAllHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 },
  playtestAllTitle: { fontSize: 15 },
  ptSuit: { paddingTop: 9, borderTopWidth: 1 },
  ptSuitHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  ptSuitName: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  ptSuitCount: { marginLeft: 'auto', fontSize: 11 },
  ptSuitCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tinyFaceBox: { width: 30, height: 42, borderRadius: 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tinyFaceScale: { width: 46, height: 66, transform: [{ scale: 0.62 }] },
  mdFaceBox: { width: 46, height: 66 },
  lgFaceBox: { width: 78, height: 112 },
  footer: { marginTop: 28, paddingTop: 18, borderTopWidth: 1, borderTopColor: C.line, fontSize: 11 },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(3,6,10,0.8)' },
  modalCard: {
    width: '100%',
    maxWidth: 430,
    maxHeight: '88%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.lineStrong,
    backgroundColor: '#141e28',
    paddingTop: 30,
    paddingHorizontal: 24,
    paddingBottom: 22,
  },
  modalClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  modalCloseText: { fontSize: 20, lineHeight: 24, color: C.muted },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  againButton: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  againText: { fontSize: 14 },
  collectButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.lineStrong,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectText: { fontSize: 14 },
  reveal: { alignItems: 'center' },
  kicker: { fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14 },
  revealArt: {
    height: 214,
    alignSelf: 'stretch',
    borderRadius: 10,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  revealRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  revealFaceBox: {
    width: 84,
    height: 120,
    borderRadius: 9,
    borderWidth: 2,
    backgroundColor: '#fffdf7',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
  },
  revealFaceScale: { width: 78, height: 112, transform: [{ scale: 1.06 }] },
  revealName: { fontSize: 26 },
  revealFlavor: { marginTop: 7, fontSize: 13, fontStyle: 'italic' },
  dupeline: { marginTop: 12, fontSize: 12, textAlign: 'center' },
  summary: { alignItems: 'stretch' },
  summaryTitle: { fontSize: 24 },
  summaryCounts: { marginTop: 4, marginBottom: 16, fontSize: 12 },
  resultList: { gap: 8 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  resultSwatch: {
    width: 40,
    height: 52,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchEmblem: { fontSize: 16 },
  resultInfo: { flex: 1, minWidth: 0 },
  resultName: { fontSize: 14 },
  resultMeta: { marginTop: 2, fontSize: 10, letterSpacing: 0.9, textTransform: 'uppercase' },
  resultTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  tagNew: { backgroundColor: C.gold },
  tagDupe: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: C.line },
  resultTagText: { fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' },
  summaryTotal: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(134,217,180,0.12)',
  },
});
