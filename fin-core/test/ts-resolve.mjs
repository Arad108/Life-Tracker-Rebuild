// Test-harness only. Not part of the library.
// Lets Node run the TypeScript sources directly while the sources keep
// extensionless imports (so they drop into the Expo/Metro repo unchanged).
import { register } from 'node:module';

register('./ts-resolve-hooks.mjs', import.meta.url);
