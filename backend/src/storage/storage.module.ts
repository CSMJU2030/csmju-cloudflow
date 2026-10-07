import { Module } from '@nestjs/common';

import { createStorageProvider } from './providers';
import { STORAGE_PROVIDER } from './providers/storage-provider';
import { SecretBox } from './secret-box';
import { StorageRequestsService } from './storage-requests.service';

/**
 * โมดูลระบบยืมพื้นที่ cloud
 *
 * ⚠️ ขั้นนี้ยังไม่ได้ import ใน AppModule — ระบบเดิมจึงไม่เปลี่ยนอะไร
 *    ขั้น API จะเพิ่ม controller แล้วค่อยเปิดใช้ (ต้องตั้ง STORAGE_SECRET_KEY ก่อน)
 */
@Module({
  providers: [
    StorageRequestsService,
    { provide: SecretBox, useFactory: () => SecretBox.fromEnv() },
    { provide: STORAGE_PROVIDER, useFactory: () => createStorageProvider() },
  ],
  exports: [StorageRequestsService],
})
export class StorageModule {}
