import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeStorageProvider } from '../src/storage/providers/fake.provider';

/** cloud จำลอง — ทดสอบในโฟลเดอร์ชั่วคราวของระบบ ไม่แตะฐานข้อมูลหรือไฟล์ใน repo */
describe('FakeStorageProvider', () => {
  const id = '6f1c2f8e-0d55-4b8e-9c7a-1d1f2b3c4d5e';
  let root: string;
  let cloud: FakeStorageProvider;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'fake-cloud-'));
    cloud = new FakeStorageProvider(root);
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it('สร้างพื้นที่และลิงก์ได้ · เรียกซ้ำได้รหัสเดิม', async () => {
    const a = await cloud.provision({ requestId: id, quotaMib: 15360, expiresOn: '2026-12-31' });
    const b = await cloud.provision({ requestId: id, quotaMib: 15360, expiresOn: '2026-12-31' });
    expect(a.providerRef).toBe(id);
    expect(a.shareUrl).toContain(id);
    expect(b.sharePassword).toBe(a.sharePassword);
    expect(await cloud.isShareEnabled(id)).toBe(true);
  });

  it('นับพื้นที่ที่ใช้ไปเป็น MiB', async () => {
    await cloud.provision({ requestId: id, quotaMib: 15360, expiresOn: '2026-12-31' });
    await writeFile(join(root, id, 'data.bin'), Buffer.alloc(3 * 1024 * 1024));
    expect(await cloud.usageMib(id)).toBe(3);
  });

  it('ปิดลิงก์แล้วไฟล์ยังอยู่ · ลบแล้วหายหมด', async () => {
    await cloud.provision({ requestId: id, quotaMib: 15360, expiresOn: '2026-12-31' });
    await writeFile(join(root, id, 'a.txt'), 'hello');
    await cloud.disableShare(id);
    expect(await cloud.isShareEnabled(id)).toBe(false);
    expect(await cloud.usageMib(id)).toBe(1);
    await cloud.destroy(id);
    expect(await cloud.usageMib(id)).toBe(0);
  });

  it('ไม่รับ id ที่ไม่ใช่ UUID (กันหลุดออกนอกโฟลเดอร์)', async () => {
    await expect(cloud.provision({ requestId: '../../etc', quotaMib: 1, expiresOn: '2026-12-31' })).rejects.toThrow();
  });
});
