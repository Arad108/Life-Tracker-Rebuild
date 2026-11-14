import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { makeDriver } from './db';
import { exportBackup, serialiseBackup } from '../fin-core/src/db';

const PHOTO_DIR = `${FileSystem.documentDirectory}photos/`;

export async function ensurePhotoDir() {
  const info = await FileSystem.getInfoAsync(PHOTO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
  }
}

export async function fullBackup(): Promise<string> {
  await ensurePhotoDir();
  const driver = makeDriver();
  const data = await exportBackup(driver, { now: () => new Date() });
  const json = serialiseBackup(data);

  const zip = new JSZip();
  zip.file('backup.json', json);

  const dir = await FileSystem.readDirectoryAsync(PHOTO_DIR);
  for (const name of dir) {
    const uri = PHOTO_DIR + name;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && !info.isDirectory) {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      zip.file(`photos/${name}`, base64, { base64: true });
    }
  }

  const base64Zip = await zip.generateAsync({ type: 'base64' });
  const out = `${FileSystem.cacheDirectory}life-tracker-backup.zip`;
  await FileSystem.writeAsStringAsync(out, base64Zip, { encoding: FileSystem.EncodingType.Base64 });
  return out;
}

