/**
 * Share links for private tables: the optional EXPO_PUBLIC_WEB_BASE_URL is
 * parsed by hand (no `URL` on Hermes), and a link is only built for a valid
 * base and a normalized room code.
 */
import { FIXTURE_ROOM_CODE } from '@chkobba/protocol/testing';

import { friendShareLink, parseWebBase, roomShareLink } from '../shareLink';

describe('parseWebBase', () => {
  it.each<[string, string]>([
    ['an https host', 'https://chkobba.example.com'],
    ['an http host', 'http://chkobba.example.com'],
    ['a LAN IPv4 address with a port', 'http://192.168.1.10:8081'],
    ['localhost with a port', 'http://localhost:8081'],
    ['a single-label host', 'https://chkobba'],
    ['a hyphenated host', 'https://chk-obba.example-host.com'],
    ['the lowest port', 'http://example.com:1'],
    ['the highest port', 'http://example.com:65535'],
  ])('should return %s unchanged', (_label, value) => {
    // Arrange
    const input = value;

    // Act
    const origin = parseWebBase(input);

    // Assert
    expect(origin).toBe(value);
  });

  it.each<[string, string, string]>([
    ['a trailing slash', 'https://chkobba.example.com/', 'https://chkobba.example.com'],
    ['a trailing slash after a port', 'http://192.168.1.10:8081/', 'http://192.168.1.10:8081'],
    ['surrounding whitespace', '  https://chkobba.example.com \n', 'https://chkobba.example.com'],
    ['an uppercase scheme', 'HTTPS://chkobba.example.com', 'https://chkobba.example.com'],
    ['a mixed-case http scheme', 'Http://example.com', 'http://example.com'],
    ['an uppercase host', 'https://Chkobba.Example.COM', 'https://Chkobba.Example.COM'],
  ])('should normalize %s', (_label, value, expected) => {
    // Arrange
    const input = value;

    // Act
    const origin = parseWebBase(input);

    // Assert
    expect(origin).toBe(expected);
  });

  it.each<[string, string | undefined]>([
    ['unset', undefined],
    ['empty', ''],
    ['only whitespace', '   '],
    ['only a slash', '/'],
    ['a bare host without scheme', 'chkobba.example.com'],
    ['a protocol-relative URL', '//chkobba.example.com'],
    ['an ftp URL', 'ftp://chkobba.example.com'],
    ['a javascript URL', 'javascript://chkobba.example.com'],
    ['a scheme without a host', 'https://'],
    ['a scheme with only a slash', 'https:///'],
    ['a missing slash after the scheme', 'https:/chkobba.example.com'],
    ['a path', 'https://chkobba.example.com/app'],
    ['a path with a trailing slash', 'https://chkobba.example.com/app/'],
    ['two trailing slashes', 'https://chkobba.example.com//'],
    ['a query', 'https://chkobba.example.com?ref=1'],
    ['a query after a slash', 'https://chkobba.example.com/?ref=1'],
    ['a hash', 'https://chkobba.example.com#t'],
    ['user info', 'https://user@chkobba.example.com'],
    ['user info with a password', 'https://user:secret@chkobba.example.com'],
    ['an IPv6 loopback', 'http://[::1]:8081'],
    ['an IPv6 address without a port', 'http://[2001:db8::1]'],
    ['port 0', 'http://chkobba.example.com:0'],
    ['port 65536', 'http://chkobba.example.com:65536'],
    ['a six-digit port', 'http://chkobba.example.com:123456'],
    ['a non-numeric port', 'http://chkobba.example.com:http'],
    ['an empty port', 'http://chkobba.example.com:'],
    ['a space in the host', 'https://chkobba example.com'],
    ['an empty host label', 'https://chkobba..example.com'],
    ['a leading dot', 'https://.chkobba.example.com'],
    ['an underscore in the host', 'https://chk_obba.example.com'],
    ['a value longer than 256 characters', `https://${'a'.repeat(250)}.com`],
  ])('should return null when the value is %s', (_label, value) => {
    // Arrange
    const input = value;

    // Act
    const origin = parseWebBase(input);

    // Assert
    expect(origin).toBeNull();
  });
});

describe('roomShareLink', () => {
  const ORIGINAL = process.env.EXPO_PUBLIC_WEB_BASE_URL;

  function setBase(value: string | undefined): void {
    if (value === undefined) delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
    else process.env.EXPO_PUBLIC_WEB_BASE_URL = value;
  }

  beforeEach(() => {
    setBase(undefined);
  });

  afterEach(() => {
    setBase(ORIGINAL);
  });

  it('should build base + /t/ + code when the base is set', () => {
    // Arrange
    setBase('https://chkobba.example.com');

    // Act
    const link = roomShareLink(FIXTURE_ROOM_CODE);

    // Assert
    expect(link).toBe(`https://chkobba.example.com/t/${FIXTURE_ROOM_CODE}`);
  });

  it('should not double the slash when the base ends with one', () => {
    // Arrange
    setBase('http://192.168.1.10:8081/');

    // Act
    const link = roomShareLink(FIXTURE_ROOM_CODE);

    // Assert
    expect(link).toBe(`http://192.168.1.10:8081/t/${FIXTURE_ROOM_CODE}`);
  });

  it('should lowercase the scheme of the base', () => {
    // Arrange
    setBase('HTTPS://chkobba.example.com');

    // Act
    const link = roomShareLink(FIXTURE_ROOM_CODE);

    // Assert
    expect(link).toBe(`https://chkobba.example.com/t/${FIXTURE_ROOM_CODE}`);
  });

  it('should return null when the base is unset', () => {
    // Arrange (beforeEach unsets the base)

    // Act
    const link = roomShareLink(FIXTURE_ROOM_CODE);

    // Assert
    expect(link).toBeNull();
  });

  it('should return null when the base is empty', () => {
    // Arrange
    setBase('');

    // Act
    const link = roomShareLink(FIXTURE_ROOM_CODE);

    // Assert
    expect(link).toBeNull();
  });

  it('should return null when the base is malformed', () => {
    // Arrange
    setBase('https://chkobba.example.com/app?x=1');

    // Act
    const link = roomShareLink(FIXTURE_ROOM_CODE);

    // Assert
    expect(link).toBeNull();
  });

  it.each([
    ['lowercase', 'k7m2qx'],
    ['dashed', 'K7M-2QX'],
    ['too short', 'K7M2Q'],
    ['outside the alphabet', 'K7M2Q0'],
    ['empty', ''],
    ['a path traversal', '../../x'],
  ])('should return null when the code is %s even with a base set', (_label, code) => {
    // Arrange
    setBase('https://chkobba.example.com');

    // Act
    const link = roomShareLink(code);

    // Assert
    expect(link).toBeNull();
  });
});

describe('friendShareLink', () => {
  const ORIGINAL = process.env.EXPO_PUBLIC_WEB_BASE_URL;
  const FRIEND_CODE = 'ABCD2345';

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
    else process.env.EXPO_PUBLIC_WEB_BASE_URL = ORIGINAL;
  });

  it.each([
    ['a normalized code', FRIEND_CODE],
    ['a lowercase dashed code', 'abcd-2345'],
    ['a spaced code with a trailing newline', 'ABCD 2345\n'],
  ])('should build base + /f/ + the normalized code from %s', (_label, code) => {
    // Arrange
    process.env.EXPO_PUBLIC_WEB_BASE_URL = 'https://chkobba.example.com/';

    // Act
    const link = friendShareLink(code);

    // Assert
    expect(link).toBe(`https://chkobba.example.com/f/${FRIEND_CODE}`);
  });

  it('should return null when the base is unset', () => {
    // Arrange
    delete process.env.EXPO_PUBLIC_WEB_BASE_URL;

    // Act
    const link = friendShareLink(FRIEND_CODE);

    // Assert
    expect(link).toBeNull();
  });

  it.each([
    ['too short', 'ABCD234'],
    ['outside the alphabet', 'ABCD2340'],
    ['a room code', 'ABC234'],
    ['a path traversal', '../../xyz'],
  ])('should return null when the code is %s even with a base set', (_label, code) => {
    // Arrange
    process.env.EXPO_PUBLIC_WEB_BASE_URL = 'https://chkobba.example.com';

    // Act
    const link = friendShareLink(code);

    // Assert
    expect(link).toBeNull();
  });
});
