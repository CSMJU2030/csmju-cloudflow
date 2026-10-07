import { Module } from '@nestjs/common';

import { createStorageProvider } from './providers';
import { STORAGE_PROVIDER } from './providers/storage-provider';
import { SECRET_BOX, SecretBox } from './secret-box';
import { StorageController, StoragePoolsController } from './storage.controller';
import { StorageRequestsService } from './storage-requests.service';

/**
 * โมดูลระบบยืมพื้นที่ cloud
 *
 * เปิด/ปิดด้วย STORAGE_SECRET_KEY: ไม่ตั้ง = ทุก endpoint ของ storage ตอบ 503 ส่วนอื่นของแอปทำงานตามเดิม
 */
@Module({
  controllers: [StoragePoolsController, StorageController],
  providers: [
    StorageRequestsService,
    { provide: SECRET_BOX, useFactory: () => SecretBox.fromEnvOrNull() },
    { provide: STORAGE_PROVIDER, useFactory: () => createStorageProvider() },
  ],
  exports: [StorageRequestsService],
})
export class StorageModule {}
