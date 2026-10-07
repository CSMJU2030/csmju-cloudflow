import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeStorageProvider } from './fake.provider';
import type { StorageProvider } from './storage-provider';

/**
 * เลือก provider จาก env STORAGE_PROVIDER (ไม่ตั้ง = fake)
 * ได้ cloud จริงเมื่อไหร่ เพิ่ม case ใหม่ที่นี่ — service ไม่ต้องแก้
 */
export function createStorageProvider(env: NodeJS.ProcessEnv = process.env): StorageProvider {
  const name = env.STORAGE_PROVIDER?.trim() || 'fake';
  switch (name) {
    case 'fake':
      // root ต้องอยู่นอก repo · ไม่ตั้ง = โฟลเดอร์ temp ของเครื่อง
      return new FakeStorageProvider(
        env.STORAGE_FAKE_ROOT?.trim() || join(tmpdir(), 'csmju-cloudflow-fake-cloud'),
        env.STORAGE_FAKE_PUBLIC_URL?.trim() || undefined,
      );
    default:
      throw new Error(`ยังไม่รองรับ STORAGE_PROVIDER=${name} (มีแค่ fake)`);
  }
}
