import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { createStorageProvider } from './providers';
import { STORAGE_PROVIDER } from './providers/storage-provider';
import { SECRET_BOX, SecretBox } from './secret-box';
import { StorageController, StorageJobsController, StoragePoolsController } from './storage.controller';
import { StorageJobsService } from './storage-jobs.service';
import { StorageRequestsService } from './storage-requests.service';

/**
 * โมดูลระบบยืมพื้นที่ cloud
 *
 * เปิด/ปิดด้วย STORAGE_SECRET_KEY: ไม่ตั้ง = ทุก endpoint ของ storage ตอบ 503 และงานตั้งเวลาไม่ทำอะไร
 * ส่วนอื่นของแอปทำงานตามเดิม
 */
@Module({
  // ScheduleModule อยู่ที่นี่ที่เดียว (ระบบนี้มีงานตั้งเวลาแค่ของ storage)
  imports: [ScheduleModule.forRoot()],
  controllers: [StoragePoolsController, StorageController, StorageJobsController],
  providers: [
    StorageRequestsService,
    StorageJobsService,
    { provide: SECRET_BOX, useFactory: () => SecretBox.fromEnvOrNull() },
    { provide: STORAGE_PROVIDER, useFactory: () => createStorageProvider() },
  ],
  exports: [StorageRequestsService],
})
export class StorageModule {}
