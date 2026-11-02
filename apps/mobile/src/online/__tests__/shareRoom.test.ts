import { Platform, Share } from 'react-native';

import { i18n } from '../../i18n/i18n';
import { copyFriendCode, copyRoomCode, roomShareText, shareFriendCode, shareRoom } from '../shareRoom';

const CODE = 'ABC234';
const BASE = 'https://chkobba.example';
const MESSAGE = `Join my Chkobba table! Code: ${CODE}`;
const MESSAGE_WITH_LINK = `${MESSAGE}\n${BASE}/t/${CODE}`;
const tr = i18n.getFixedT('en');

const g = globalThis as unknown as Record<string, unknown>;
const savedEnv = process.env.EXPO_PUBLIC_WEB_BASE_URL;
const savedWindow = Object.getOwnPropertyDescriptor(g, 'window');
const savedNavigator = Object.getOwnPropertyDescriptor(g, 'navigator');

function setGlobal(name: 'window' | 'navigator', value: unknown): void {
  Object.defineProperty(g, name, { value, configurable: true, writable: true });
}

function restoreGlobal(name: 'window' | 'navigator', saved: PropertyDescriptor | undefined): void {
  if (saved === undefined) delete g[name];
  else Object.defineProperty(g, name, saved);
}

/** Sets up a browser: `secure` drives `window.isSecureContext`; `nav` replaces `navigator`. */
function browser(secure: boolean, nav: { share?: jest.Mock; clipboard?: { writeText: jest.Mock } }): void {
  jest.replaceProperty(Platform, 'OS', 'web');
  setGlobal('window', { isSecureContext: secure });
  setGlobal('navigator', nav);
}

function abortError(): Error {
  const error = new Error('cancelled');
  error.name = 'AbortError';
  return error;
}

let shareSpy: jest.SpyInstance;

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
  shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
});

afterEach(() => {
  jest.restoreAllMocks();
  if (savedEnv === undefined) delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
  else process.env.EXPO_PUBLIC_WEB_BASE_URL = savedEnv;
  restoreGlobal('window', savedWindow);
  restoreGlobal('navigator', savedNavigator);
});

describe('roomShareText', () => {
  it('is the message alone without a configured base URL', () => {
    expect(roomShareText(CODE, tr)).toBe(MESSAGE);
  });

  it('adds the link when a base URL is configured', () => {
    process.env.EXPO_PUBLIC_WEB_BASE_URL = BASE;
    expect(roomShareText(CODE, tr)).toBe(MESSAGE_WITH_LINK);
  });
});

describe('shareRoom on native', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
  });

  it('shares the code alone when there is no link', async () => {
    await expect(shareRoom(CODE, tr)).resolves.toBe('shared');
    expect(shareSpy).toHaveBeenCalledWith({ message: MESSAGE });
  });

  it('shares the message and link', async () => {
    process.env.EXPO_PUBLIC_WEB_BASE_URL = BASE;
    await expect(shareRoom(CODE, tr)).resolves.toBe('shared');
    expect(shareSpy).toHaveBeenCalledWith({ message: MESSAGE_WITH_LINK });
  });

  it('reports a dismissed sheet as shared', async () => {
    shareSpy.mockResolvedValue({ action: Share.dismissedAction, activityType: undefined });
    await expect(shareRoom(CODE, tr)).resolves.toBe('shared');
  });

  it('is unavailable when Share throws', async () => {
    shareSpy.mockRejectedValue(new Error('no activity'));
    await expect(shareRoom(CODE, tr)).resolves.toBe('unavailable');
  });
});

describe('shareRoom on web', () => {
  it('uses navigator.share in a secure context', async () => {
    process.env.EXPO_PUBLIC_WEB_BASE_URL = BASE;
    const share = jest.fn().mockResolvedValue(undefined);
    const writeText = jest.fn().mockResolvedValue(undefined);
    browser(true, { share, clipboard: { writeText } });
    await expect(shareRoom(CODE, tr)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: MESSAGE_WITH_LINK });
    expect(writeText).not.toHaveBeenCalled();
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('copies when only the clipboard exists', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    browser(true, { clipboard: { writeText } });
    await expect(shareRoom(CODE, tr)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(MESSAGE);
  });

  it('treats a cancelled share (AbortError) as shared and does not copy', async () => {
    const share = jest.fn().mockRejectedValue(abortError());
    const writeText = jest.fn().mockResolvedValue(undefined);
    browser(true, { share, clipboard: { writeText } });
    await expect(shareRoom(CODE, tr)).resolves.toBe('shared');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when share fails for another reason', async () => {
    const notAllowed = new Error('no activation');
    notAllowed.name = 'NotAllowedError';
    const share = jest.fn().mockRejectedValue(notAllowed);
    const writeText = jest.fn().mockResolvedValue(undefined);
    browser(true, { share, clipboard: { writeText } });
    await expect(shareRoom(CODE, tr)).resolves.toBe('copied');
  });

  it('is unavailable over plain http and never touches the APIs', async () => {
    const share = jest.fn();
    const writeText = jest.fn();
    browser(false, { share, clipboard: { writeText } });
    await expect(shareRoom(CODE, tr)).resolves.toBe('unavailable');
    expect(share).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('is unavailable when neither API exists', async () => {
    browser(true, {});
    await expect(shareRoom(CODE, tr)).resolves.toBe('unavailable');
  });

  it('is unavailable when the clipboard write rejects', async () => {
    browser(true, { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } });
    await expect(shareRoom(CODE, tr)).resolves.toBe('unavailable');
  });
});

describe('copyRoomCode', () => {
  it('copies the bare code on web in a secure context', async () => {
    const share = jest.fn();
    const writeText = jest.fn().mockResolvedValue(undefined);
    browser(true, { share, clipboard: { writeText } });
    await expect(copyRoomCode(CODE)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(CODE);
    expect(share).not.toHaveBeenCalled();
  });

  it('is unavailable on web over plain http', async () => {
    const writeText = jest.fn();
    browser(false, { clipboard: { writeText } });
    await expect(copyRoomCode(CODE)).resolves.toBe('unavailable');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('opens the share sheet with the code on native', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await expect(copyRoomCode(CODE)).resolves.toBe('shared');
    expect(shareSpy).toHaveBeenCalledWith({ message: CODE });
  });

  it('is unavailable on native when Share throws', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    shareSpy.mockRejectedValue(new Error('boom'));
    await expect(copyRoomCode(CODE)).resolves.toBe('unavailable');
  });
});

describe('shareFriendCode', () => {
  const FRIEND_MESSAGE = 'Add me on Chkobba: ABCD-2345';

  it('opens the share sheet with the given message on native', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await expect(shareFriendCode(FRIEND_MESSAGE)).resolves.toBe('shared');
    expect(shareSpy).toHaveBeenCalledWith({ message: FRIEND_MESSAGE });
  });

  it('is unavailable on web over plain http', async () => {
    const share = jest.fn();
    browser(false, { share });
    await expect(shareFriendCode(FRIEND_MESSAGE)).resolves.toBe('unavailable');
    expect(share).not.toHaveBeenCalled();
  });
});

describe('copyFriendCode', () => {
  it('copies the raw code without the display dash on web', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    browser(true, { clipboard: { writeText } });
    await expect(copyFriendCode('abcd-2345')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('ABCD2345');
  });

  it('opens the share sheet with the raw code on native', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await expect(copyFriendCode('ABCD-2345')).resolves.toBe('shared');
    expect(shareSpy).toHaveBeenCalledWith({ message: 'ABCD2345' });
  });
});
