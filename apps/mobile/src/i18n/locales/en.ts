import type {
  DirectoryRpcErrorCode,
  EmoteId,
  FriendErrorCode,
  InviteRpcErrorCode,
  NameErrorCode,
} from '@chkobba/protocol';

/**
 * English: the source catalog. Its shape is the `Translation` type every other
 * catalog must match, and it types `t()` keys app-wide (see `i18next.d.ts`).
 *
 * - Plurals: `key_one` / `key_other`, picked by `{ count }`.
 * - "You" wording: `key_you`, picked by `{ context: 'you' }` for our own seat.
 * - Interpolation: `{{name}}`; values are not HTML-escaped (React Native renders text).
 */
export const en = {
  common: {
    you: 'You',
    youInitial: 'Y',
    continue: 'Continue',
    tapToContinue: 'Tap to continue',
    backToLobby: 'Back to lobby',
    tryAgain: 'Try again',
    back: 'Back',
    cancel: 'Cancel',
    close: 'Close',
    seatN: 'Seat {{n}}',
  },
  brand: {
    tagline: 'The Tunisian card game',
  },
  lobby: {
    guest: 'Guest',
    offline: 'Offline',
    kicker: 'Café lobby',
    title: 'Pick a table',
    bots: {
      title: 'Play vs bots',
      subtitle: '2 vs 2 with a bot partner, or 1 vs 1. Works offline.',
    },
    quick: {
      title: 'Quick match',
      subtitle: 'Join the next free table online.',
    },
    private: 'Private table',
    privateSubtitle: 'Play with friends using a code.',
    privateCreate: 'Create private table',
    joinCode: {
      entry: 'Join with code',
      title: 'Join a private table',
      placeholder: 'e.g. 7KQ4MZ',
      join: 'Join',
      invalid: 'Codes are 6 letters and digits.',
    },
    friends: 'Friends',
    /** The lobby tile into the players directory; Ranking now lives inside it. */
    players: 'Players',
    playersSubtitle: 'Find players and see profiles',
    openTables: 'Open tables',
    openTablesSoon: 'Browsing open tables is coming soon. Use Quick match to join one now.',
    soon: 'Soon',
    comingSoon: '{{title}}, coming soon',
    tileWithBadge: '{{title}}, {{badge}}',
    friendRequests_one: '{{count}} friend request',
    friendRequests_other: '{{count}} friend requests',
  },
  bots: {
    table: 'Table',
    twoVsTwo: '2 vs 2',
    twoVsTwoHint: 'You + bot partner',
    oneVsOne: '1 vs 1',
    oneVsOneHint: 'Head to head',
    playTo: 'Play to',
    points_one: '{{count}} point',
    points_other: '{{count}} points',
    classic: 'Classic',
    quickGame: 'Quick game',
    level: 'Bots',
    easy: 'Easy',
    normal: 'Normal',
    hard: 'Hard',
    start: 'Start game',
  },
  settings: {
    title: 'Settings',
    language: 'Language',
    tableStyle: 'Table style',
    name: 'Your name',
    sound: 'Sound',
    emotes: 'Emotes from others',
    on: 'On',
    off: 'Off',
  },
  /** The "Who can see you" row in lobby Settings. `nobody` hides presence, but is not a block. */
  privacy: {
    rowLabel: 'Who can see you',
    everyone: {
      label: 'Everyone',
      hint: 'Other players can see when you are online.',
    },
    nobody: {
      label: 'Nobody',
      hint: "Hides you from everyone, but it isn't a block and anyone at your table still sees you.",
    },
  },
  /** The "Choose your name" step and the Settings rename field; cancel reuses `common.cancel`. */
  name: {
    title: 'Choose your name',
    hint: '3–16 letters, digits or spaces, in Latin or Arabic script.',
    placeholder: 'e.g. Hamza',
    continue: 'Continue',
    save: 'Save',
    saved: 'Name saved',
    cooldown: 'You can rename again in {{minutes}} min',
    /** One message per server `NameErrorCode`, plus `network` for a failed request. */
    errors: {
      name_too_short: 'Too short: use at least 3 characters.',
      name_too_long: 'Too long: use at most 16 characters.',
      name_bad_chars:
        "Use only letters, digits and spaces. Symbols, emoji, tatweel (ـ) and diacritics (harakat) aren't allowed.",
      name_not_allowed: "This name isn't allowed. Try another.",
      name_taken: 'That name is already taken. Try another.',
      name_rate_limited: 'You changed your name recently. Try again later.',
      username_locked: "Your username can't be changed.",
      field_locked: "That can't be changed here.",
      network: "Couldn't save your name. Check your connection and try again.",
    } satisfies Record<NameErrorCode | 'network', string>,
  },
  skins: {
    cafe: 'Café Tunisien',
    minimal: 'Modern Minimal',
    sahara: 'Sahara Night',
    sidi: 'Sidi Bou Said',
    neon: 'Neon Souk',
    title: 'Skins',
    subtitle: 'Open boxes, collect & equip decks',
    deckHint: 'Deck skins change the cards only. Your table keeps its style.',
    tableDefault: 'Table style',
    tableDefaultHint: 'Use the cards from your current table skin.',
    inUse: 'In use',
    rarity: {
      common: 'Common',
      rare: 'Rare',
      epic: 'Epic',
      mythic: 'Mythic',
    },
  },
  vault: {
    coins: 'Coins',
    title: 'Deck Vault',
    tagline: 'Chkobba cosmetic decks',
    statBoxes: 'Boxes opened',
    statDecks: 'Decks found',
    statCoins: 'Coins',
    openVault: 'Open a vault',
    openOne: 'Open 1 box',
    openFive: 'Open 5',
    price: '{{coins}} coins',
    earn: 'Coins come from match wins (+{{coins}} each). Duplicates refund a little.',
    matchWin: 'Match win · +{{coins}} coins',
    notEnough: 'Not enough coins. Win a match to earn more.',
    odds: 'Drop rates',
    perBox: 'Per box',
    oddsNote: 'Cosmetic decks only. Duplicates refund a small amount of coins.',
    collectionTitle: 'Deck collection',
    collection: 'Collection',
    progress: '{{owned}} of {{total}} decks collected',
    progressLong: '{{owned}} of {{total}} decks collected · 5 designs per rarity',
    filterAll: 'All',
    locked: 'Locked',
    equip: 'Equip',
    equipped: 'Equipped',
    useTable: 'Use table cards',
    dimNote: 'Locked designs are dimmed so you can preview all 20 decks.',
    footerNote: 'Odds 65 / 20 / 10 / 5 · 5 deck designs per rarity',
    new: 'New',
    duplicate: 'Duplicate',
    newDeck: 'New deck unlocked',
    duplicateFound: 'Duplicate deck',
    vaultsOpened: '{{count}} vaults opened',
    revealSummary: '{{newCount}} new decks · {{dupeCount}} duplicates',
    refundOne: 'Duplicate · +{{coins}} coins refunded',
    refundTotal: '+{{coins}} coins from duplicates',
    addedLine: 'Added to your collection · deck skin applies to all 40 cards',
    added: 'Added to your collection.',
    openAnother: 'Open another',
    openFiveMore: 'Open 5 more',
    done: 'Collect',
    previewCards: 'Preview cards',
    playtestKicker: 'Card playtest · mock table',
    opponentHand: 'Opponent hand',
    tableLabel: 'Table · 4 up + 1 face-down',
    handLabel: 'Your hand · 7♦ is 7aya (gold outline)',
    captured: 'Captured {{count}}',
    dealCards: 'Deal random cards',
    fullDeck: 'Full 40-card deck',
    fullDeckNote: '4 suits × 10 ranks · no 8, 9 or 10',
    previewNote: 'Faces and backs at real card proportions — not the real game table.',
    ownedPreviewLine: 'Owned ×{{count}} · skin applied to faces and backs',
    lockedPreviewLine: 'Locked design preview · skin applied to faces and backs',
    suitD: 'Dineri',
    suitS: 'Spades',
    suitH: 'Hearts',
    suitC: 'Clubs',
  },
  help: {
    title: 'How to play',
    theGame: 'The game',
    rule1: '2 vs 2, partners sit opposite. First team to 21 (or 11) wins, checked at the end of a round.',
    rule2: 'Cards count their number; Queen 8, Jack 9, King 10. 40 cards, no 8s, 9s or 10s.',
    rule3:
      '3 cards each, 4 face up on the table, 3 more each when hands are empty. Each round the player after the dealer keeps the cut card or throws it on the table.',
    rule4:
      'Play one card: take a table card of the same rank, or else cards that add up to it. Same rank comes first, and if your card can capture, it must.',
    rule5: 'Chkobba: you clear the table (not with the last card of the round). Cards left at the end go to whoever captured last.',
    scoring: 'Scoring · 1 point each',
    tie: 'A tie in any of these scores nothing.',
    how: {
      karta: 'Most cards',
      dineri: 'Most diamonds ♦',
      bermila: 'Most 7s (6s break a tie)',
      haya: 'The 7 of diamonds',
      chkobba: 'Each sweep of the table',
    },
  },
  scoring: {
    karta: 'Karta',
    dineri: 'Dineri',
    bermila: 'Bermila',
    haya: '7aya',
    chkobba: 'Chkobba',
  },
  score: {
    us: 'Us',
    them: 'Them',
    roundTo: 'Round {{round}} · to {{target}}',
    dealer: 'Dealer {{name}}',
    stock: 'Stock {{n}}',
    round: 'Round',
    to: 'To',
    stockLabel: 'Stock',
    dealerLabel: 'Dealer',
  },
  summary: {
    youWin: 'You win!',
    youLose: 'You lose',
    roundDone: 'Round {{round}} done',
    round: 'Round',
    game: 'Game',
    playAgain: 'Play again',
    home: 'Home',
    nextStarting: 'Next round starting…',
    nextIn: 'Next round in {{seconds}} s',
    nextRound: 'Next round',
    cards_one: '{{count}} card',
    cards_other: '{{count}} cards',
    sweeps_one: '{{count}} sweep',
    sweeps_other: '{{count}} sweeps',
  },
  table: {
    empty: 'Empty table',
    placeHere: 'Place the card on the table',
  },
  cut: {
    title: 'Your cut',
    hint: 'Keep it and you are dealt 2 more, or throw it face up on the table.',
    keep: 'Keep',
    throw: 'Throw',
  },
  dealerDraw: {
    title: 'Who deals?',
    hint: 'Everyone draws a card. The lowest card deals first.',
    tiesAgain: 'Ties drew again.',
    youDeal: 'You deal first',
    theyDeal: '{{name}} deals first',
  },
  capture: {
    place: 'Place on table',
    take: 'Take',
    takeCards: 'Take {{cards}}',
  },
  status: {
    yourCut: 'Your cut',
    cutting: '{{name}} is cutting…',
    pickCapture: 'Pick what to take',
    yourTurn: 'Your turn',
    waitingFor: 'Waiting for {{name}}…',
  },
  seat: {
    yourTime: 'Your time',
    turnTimer: '{{owner}}: turn timer',
    secondsLeft_one: '{{owner}}: {{count}} second left',
    secondsLeft_other: '{{owner}}: {{count}} seconds left',
    partner: 'Partner',
    opponent: 'Opponent',
    offline: 'Offline',
    away: 'Away',
    isOffline: '{{name}} is offline',
    isAway: '{{name}} is away',
    thinking: 'thinking…',
  },
  desktop: {
    turnHint: 'Hover a card to preview its captures. Click it, or press ← → to choose, then pick an option (1–9) or press Enter.',
    keyboardHint: 'Keyboard: ← → choose a card · 1–9 pick a capture · Enter play · Esc cancel',
    pickTurnHint: 'Click a card, then click the table cards it takes, or the empty table to place it. Double-click places a card.',
    pickKeyboardHint: 'Keyboard: ← → choose a card · Enter place · Esc cancel',
  },
  card: {
    label: '{{rank}} of {{suit}}',
  },
  suits: {
    D: 'diamonds',
    H: 'hearts',
    S: 'spades',
    C: 'clubs',
  },
  sound: {
    title: 'Sound',
    open: 'Sound settings',
    on: 'Sound on',
    muted: 'Muted',
    effects: 'Sound effects',
    ambience: 'Background sound',
    off: 'Off',
    level: '{{level}} of {{max}}',
  },
  emotes: {
    title: 'Emotes',
    hint: 'Everyone at the table sees them',
    more: 'More emotes',
    keyboardHint: 'Press E for emotes, then 1–9 to send',
    send: 'Send {{emote}}',
    said: '{{name}}: {{emote}}',
    seatMenu: '{{name}}: emote options',
    mute: 'Mute emotes',
    unmute: 'Unmute emotes',
    muted: 'Emotes muted',
    names: {
      thumbs: 'Thumbs up',
      laugh: 'Laughing',
      facepalm: 'Facepalm',
      fire: 'Fire',
      wow: 'Wow',
      pray: 'Please',
      yalla: 'Yalla!',
      sahha: 'Sa77a!',
      mabrouk: 'Mabrouk!',
      bravo: 'Bravo!',
      khsara: 'Ya khsara',
      chwaya: 'Chwaya chwaya',
    } satisfies Record<EmoteId, string>,
    phrases: {
      yalla: 'Yalla!',
      sahha: 'Sa77a!',
      mabrouk: 'Mabrouk!',
      bravo: 'Bravo!',
      khsara: 'Ya khsara…',
      chwaya: 'Chwaya chwaya',
    },
  },
  celebration: {
    swept: '{{name}} swept the table · +1 for {{team}}',
  },
  log: {
    dealerDrawn: '{{name}} drew the lowest card ({{card}}) and deals first',
    dealerDrawn_you: 'You drew the lowest card ({{card}}) and deal first',
    cutOffered: '{{name}} cuts the deck',
    cutOffered_you: 'You cut the deck',
    cutKept: '{{name}} kept the cut card',
    cutKept_you: 'You kept the cut card',
    cutThrown: '{{name}} threw {{card}} on the table',
    cutThrown_you: 'You threw {{card}} on the table',
    redealt: 'Three of a kind on the table: reshuffle',
    placed: '{{name}} placed {{card}}',
    placed_you: 'You placed {{card}}',
    took: '{{name}} took {{cards}} with {{card}}',
    took_you: 'You took {{cards}} with {{card}}',
    chkobba: 'CHKOBBA!',
    tableCollected_one: 'Last capture takes the table ({{count}} card)',
    tableCollected_other: 'Last capture takes the table ({{count}} cards)',
    newDeal: 'New deal ({{deal}})',
    roundStarted: 'Round {{round}} · {{name}} shuffles',
    roundStarted_you: 'Round {{round}} · You shuffle',
  },
  online: {
    connecting: 'Connecting…',
    connected: 'Connected',
    reconnecting: 'Reconnecting…',
    connectionLost: 'Connection lost. Reconnecting…',
    away: "You're away — a bot is playing for you",
    imBack: "I'm back",
    connectionProblem: 'Connection problem',
  },
  finding: {
    title: 'Finding players…',
    looking: 'Looking for a table…',
    noTable: 'No table found',
    unreachable: 'The game server could not be reached. Check your connection and try again.',
    seatsFilled: '{{filled}} of {{total}} seats filled',
    botsIn: 'Bots join in {{seconds}} s',
    botsJoining: 'Bots are joining…',
  },
  /** The private-table room: seats, standing list and host controls. */
  room: {
    title: 'Private table',
    codeLabel: 'Room code',
    share: 'Share',
    shareMessage: 'Join my Chkobba table! Code: {{code}}',
    copy: 'Copy code',
    copied: 'Code copied',
    linkUnavailable: "Share links don't work here. Tell your friends the code.",
    seats: 'Seats',
    team: 'Team {{n}}',
    host: 'Host',
    standing: 'Waiting for a seat',
    sit: 'Sit here',
    switch: 'Move here',
    start: 'Start game',
    startHintHost: 'Empty seats will be filled with bots.',
    startHintGuest: 'Waiting for the host to start…',
    takeOver: 'Take over',
    waitingForGameEnd: 'Waiting for this game to end…',
    backToRoomIn: 'Back to the room in {{seconds}} s',
    backToRoom: 'Back to the room',
    leave: 'Leave table',
    emptySeat: 'Empty seat',
    bot: 'Bot',
    you: '{{name}} (you)',
  },
  /** Friends: the /friends screen, /f/[code] preview, toasts and the table player sheet. */
  friends: {
    title: 'Friends',
    /**
     * The Friends screen's secondary way into the directory. The friend code
     * card and the add-by-code form retired in v1: names are the handle now.
     */
    findPlayers: 'Find players',
    findPlayersHint: 'Search by name and add anyone.',
    /** The persistent card for a player with no claimed name, so nothing can find them. */
    unlisted: {
      title: 'Choose a name to be found',
      body: 'Players can only find and add you by name. Your code is no longer shown.',
      action: 'Choose a name',
    },
    /** The "Blocked players" screen, reached from Friends. */
    blocked: {
      title: 'Blocked players',
      open: 'Blocked players',
      empty: "You haven't blocked anyone.",
      unblock: 'Unblock',
    },
    /**
     * Legacy `/f/CODE` links from shipped builds. The code UI is retired, so
     * these keep only what that screen needs: the lookup notices, Add and the
     * title. Keep them while the route exists.
     */
    add: {
      submit: 'Add friend',
      looking: 'Looking up the code…',
      self: 'This is your code',
      notFound: 'No player with this code',
    },
    /** The `/f/CODE` share-link screen. */
    link: {
      title: 'Friend code',
      openFriends: 'Open friends',
    },
    sections: {
      incoming: 'Requests',
      outgoing: 'Sent',
      friends: 'Friends',
      recent: 'Recent players',
      blocked: 'Blocked',
    },
    actions: {
      accept: 'Accept',
      decline: 'Decline',
      cancel: 'Cancel request',
      add: 'Add friend',
      remove: 'Remove',
      block: 'Block',
      unblock: 'Unblock',
      requestSent: 'Request sent',
      friends: 'Friends',
    },
    /** Spoken label of a friend button that names its player, e.g. "Accept, Sami". */
    actionFor: '{{action}}, {{name}}',
    confirm: {
      removeTitle: 'Remove friend',
      removeBody: 'Remove {{name}} from your friends?',
      remove: 'Remove',
      blockTitle: 'Block {{name}}?',
      blockBody:
        "They can't send you friend requests. They're removed from your friends and recent players, and their emotes are muted at the table.",
      block: 'Block',
      cancel: 'Cancel',
    },
    availability: {
      online: 'Online',
      room: 'In a room',
      playing: 'In a game',
      offline: 'Offline',
    },
    empty: {
      incoming: 'No friend requests.',
      outgoing: 'No requests waiting for an answer.',
      friends: 'No friends yet. Find someone by name, or add a player from a table.',
      recent: 'Players you meet at online tables show up here.',
      blocked: "You haven't blocked anyone.",
    },
    /** One message per server `FriendErrorCode`, plus `not_found` and `network`. */
    errors: {
      friend_bad_request: "That request couldn't be sent.",
      friend_outgoing_limit: 'You have 50 pending requests. Wait for some answers or cancel a few.',
      friend_limit: 'You already have 200 friends.',
      friend_their_limit: 'This player already has 200 friends.',
      not_found: 'No player with this code',
      network: "Couldn't reach the server. Check your connection and try again.",
    } satisfies Record<FriendErrorCode | 'not_found' | 'network', string>,
    toast: {
      request: '{{name}} sent you a friend request',
      accepted: '{{name}} accepted your request',
    },
    sheet: {
      title: '{{name}}',
      add: 'Add friend',
      requestSent: 'Request sent',
      friends: 'Friends',
      accept: 'Accept request',
      block: 'Block',
      unblock: 'Unblock',
      muted: 'Emotes muted',
      /** Spoken label of another player's avatar at an online table. */
      open: '{{name}}: player options',
      loading: 'Checking…',
    },
  },
  /**
   * Players directory: search, recent players, row chips and the unlisted
   * callout. `availability.hidden` means the player publishes nothing; it is
   * never "offline". `errors.directory_not_found` also covers a block in either
   * direction, so it never says which.
   */
  directory: {
    title: 'Players',
    searchPlaceholder: 'Search players by name',
    minChars: 'Type at least 2 characters.',
    recentPlayers: 'Recent players',
    noResults: 'No players found',
    noResultsHint: 'Check the spelling, or try a shorter name.',
    showRecent: 'Search recent players',
    moreResults: '20+ results. Keep typing to narrow the search.',
    loadMore: 'Load more',
    /** Rows on screen now; paging can add more, so it is "shown", not "found". */
    resultsCount_one: '{{count}} player shown',
    resultsCount_other: '{{count}} players shown',
    /** The Players / Ranking switch; Ranking is a "Soon" placeholder for now. */
    tabs: {
      players: 'Players',
      ranking: 'Ranking',
      rankingSoon: 'Soon',
    },
    /** The body of the Ranking tab until leaderboards ship. */
    rankingPlaceholder: 'Ranking is coming soon. Leaderboards will show the best players here.',
    chip: {
      add: 'Add',
      requested: 'Requested',
      friends: 'Friends',
    },
    /** `hidden` means the player publishes no presence: it is not an offline state. */
    availability: {
      hidden: 'Availability not shared',
    },
    /** Callout for a player with no claimed name, whose account is not searchable. */
    unlisted: {
      title: 'Make yourself findable',
      body: 'Choose a name so other players can find you in the directory.',
      chooseName: 'Choose a name',
      dismiss: 'Dismiss',
    },
    /** One message per `DirectoryRpcErrorCode`, plus `network` for a failed request. */
    errors: {
      directory_bad_query: 'Search with 2 to 16 characters.',
      directory_rate_limited: 'Too many searches. Wait a moment and try again.',
      directory_not_found: "We couldn't find that player.",
      presence_bad_request: "That setting couldn't be saved. Try again.",
      network: "Couldn't reach the server. Check your connection and try again.",
    } satisfies Record<DirectoryRpcErrorCode | 'network', string>,
  },
  /**
   * The player profile (`/p/[userId]` and the directory's desktop panel).
   * `relation` is the caller's own edge to the player: there is no
   * "friends since", because nakama-js drops the edge timestamp. `metAt` takes a
   * relative time as `{{when}}`. `availability.hidden` means the player shares
   * no presence, so it must never read as offline. The two stat blocks are
   * shown side by side and never summed: `stats.practice` counts are reported
   * by the player's device and are display-only (ADR-0005), hence `deviceReported`.
   */
  profile: {
    title: 'Profile',
    relation: {
      friends: 'You are friends',
      requestSent: 'Request sent',
      blocked: 'You blocked this player',
      metAt: 'Met at a table {{when}}',
    },
    /** The player publishes no presence: not an offline state. */
    availability: {
      hidden: 'Availability hidden by this player',
    },
    stats: {
      competitive: 'Competitive',
      practice: 'Practice',
      /** Marker on the practice block: its counts come from the player's device, not the match server. */
      deviceReported: 'Device-reported',
      /** Team-level: a partner's sweep counts for both seats (ADR-0005). */
      chkobbas: 'Chkobba sweeps',
      games: 'Games',
      wins: 'Wins',
      currentStreak: 'Current streak',
      bestStreak: 'Best streak',
    },
    actions: {
      add: 'Add friend',
      cancelRequest: 'Cancel request',
      invite: 'Invite to table',
      remove: 'Remove',
      block: 'Block',
      unblock: 'Unblock',
    },
    /** The route points at the caller's own user id. */
    self: 'This is your profile',
    notFound: {
      title: 'Player not found',
      body: 'Check the link, or find them in the Players screen.',
    },
    /** Same wording as `friends.confirm`, so the two block and remove surfaces never drift. */
    confirm: {
      removeTitle: 'Remove friend',
      removeBody: 'Remove {{name}} from your friends?',
      remove: 'Remove',
      blockTitle: 'Block {{name}}?',
      blockBody:
        "They can't send you friend requests. They're removed from your friends and recent players, and their emotes are muted at the table.",
      block: 'Block',
    },
  },
  /** Invites to private tables: the room's invite sheet, the lobby banner, the in-game badge and toasts. */
  invite: {
    button: 'Invite friends',
    sheetTitle: 'Invite friends',
    invite: 'Invite',
    invited: 'Invited',
    empty: 'No friends online right now. Add friends from the Friends screen.',
    banner: '{{name}} invites you to a table',
    join: 'Join',
    dismiss: 'Dismiss',
    closed: 'This table has closed',
    /** Spoken label of the in-game invite badge. */
    badge_one: '{{count}} table invite',
    badge_other: '{{count}} table invites',
    toast: '{{name}} invites you to a table',
    /** One message per server `InviteRpcErrorCode`, plus `network`. */
    errors: {
      invite_bad_request: "That invite couldn't be sent.",
      invite_not_friend: 'You can only invite friends.',
      invite_not_member: "You're no longer at this table.",
      invite_room_not_found: 'This table has closed.',
      invite_rate_limited: 'Too many invites. Try again in a few minutes.',
      network: "Couldn't reach the server. Check your connection and try again.",
    } satisfies Record<InviteRpcErrorCode | 'network', string>,
  },
  errors: {
    not_your_turn: "It's not your turn.",
    illegal_move: "That move isn't allowed.",
    wrong_phase: 'Too late: the table moved on.',
    bad_opcode: 'The server did not understand that.',
    bad_payload: 'The server did not understand that.',
    not_seated: "You don't have a seat at this table.",
    table_full: 'That table filled up. Try another quick match.',
    join_failed: "Couldn't join the table.",
    match_ended: 'This table has closed.',
    offline: "You're offline. Reconnecting…",
    room_not_found: 'Table not found. Check the code.',
    room_rate_limited: 'Too many attempts. Try again later.',
    room_bad_code: 'Codes are 6 letters and digits.',
    room_full: 'This table is full.',
    not_host: 'Only the host can do that.',
    seat_taken: 'Someone already took that seat.',
    already_seated: 'You already have a seat.',
    not_private: 'That only works at a private table.',
    unknown: 'Something went wrong.',
  },
};

/** Same keys as English, any string values: the contract for every other language. */
type Catalog<T> = { [K in keyof T]: T[K] extends string ? string : Catalog<T[K]> };
export type Translation = Catalog<typeof en>;
