/**
 * `@chkobba/protocol/testing`: shared test data for server (Vitest) and mobile
 * (Jest) tests. Never import this from `src/index.ts`, so the server bundle
 * never includes it.
 */
export * from './directoryFixtures';
export * from './friendFixtures';
export * from './nameVectors';
export * from './roomFixtures';
