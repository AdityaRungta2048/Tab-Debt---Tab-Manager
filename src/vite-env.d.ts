/// <reference types="vite/client" />

/**
 * True only in the mock dev build (`vite dev --mode mock`). Every use is a compile-time
 * constant, so the fixture generator and chrome mock are tree-shaken entirely out of the
 * extension bundle rather than shipped and merely unused.
 */
declare const __MOCK__: boolean;
