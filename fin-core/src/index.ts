/**
 * Financial Space core — public surface.
 *
 * Pure TypeScript. No React, no React Native, no expo-sqlite, no app imports.
 * Safe to unit test, safe to reuse from any screen, and safe to move into the
 * repository without touching its existing modules.
 */

export * from './types';
export * from './money';
export * from './posting';
export * from './calc';
export * from './balances';
export * from './db';
