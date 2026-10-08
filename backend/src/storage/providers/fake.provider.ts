import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import type { ProvisionInput, ProvisionResult, StorageProvider } from './storage-provider';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const META = '.cloudflow.json';

interface Meta {
  requestId: string;
  quotaMib: number;
  expiresOn: string;
  sharePassword: string;
  shareDisabled: boolean;
}

/**
 * cloud จำลองสำหรับช่วงที่ยังไม่มี cloud จริง — หนึ่งคำขอ = หนึ่งโฟลเดอร์ใต้ root
 *
 * - ไม่ต่อเน็ต ไม่ต้องมี credential · ใช้ได้ทั้งตอนพัฒนาและใน unit test
 * - root ต้องอยู่นอก repo (เช่น C:\MIS\fake-cloud) เพื่อไม่ให้ไฟล์ทดสอบหลุดเข้า git
 * - ไม่บังคับ quota จริงตอนเขียนไฟล์ (โฟลเดอร์ธรรมดาทำไม่ได้) — แค่รายงานขนาดที่ใช้ให้ระบบตัดสิน
 */
export class FakeStorageProvider implements StorageProvider {
  readonly name = 'fake';
  private readonly root: string;

  constructor(
    root: string,
    private readonly publicBaseUrl = 'http://localhost:3208/dev-storage',
  ) {
    this.root = resolve(root);
  }

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    const dir = this.dirOf(input.requestId);
    await mkdir(dir, { recursive: true });

    // idempotent: มีอยู่แล้วใช้ของเดิม (รหัสเดิม) แต่เปิดลิงก์กลับมา
    const existing = await this.readMeta(input.requestId);
    const meta: Meta = {
      requestId: input.requestId,
      quotaMib: input.quotaMib,
      expiresOn: input.expiresOn,
      sharePassword: existing?.sharePassword ?? randomBytes(9).toString('base64url'),
      shareDisabled: false,
    };
    await writeFile(join(dir, META), JSON.stringify(meta, null, 2), 'utf8');

    return {
      providerRef: input.requestId,
      shareUrl: `${this.publicBaseUrl}/${input.requestId}`,
      sharePassword: meta.sharePassword,
    };
  }

  async usageMib(providerRef: string): Promise<number> {
    const bytes = await sizeOf(this.dirOf(providerRef), true);
    return Math.ceil(bytes / (1024 * 1024));
  }

  async disableShare(providerRef: string): Promise<void> {
    const meta = await this.readMeta(providerRef);
    if (!meta) return; // ไม่มีพื้นที่ = ถือว่าปิดแล้ว
    meta.shareDisabled = true;
    await writeFile(join(this.dirOf(providerRef), META), JSON.stringify(meta, null, 2), 'utf8');
  }

  async destroy(providerRef: string): Promise<void> {
    await rm(this.dirOf(providerRef), { recursive: true, force: true });
  }

  async health(): Promise<boolean> {
    try {
      await mkdir(this.root, { recursive: true });
      return (await stat(this.root)).isDirectory();
    } catch {
      return false;
    }
  }

  /** สำหรับหน้า dev และ test เท่านั้น */
  async isShareEnabled(providerRef: string): Promise<boolean> {
    const meta = await this.readMeta(providerRef);
    return Boolean(meta && !meta.shareDisabled);
  }

  // ─────────────────────────────────────────────

  /** รับแค่ UUID — กันชื่อแปลก ๆ อย่าง ../../ ออกนอก root */
  private dirOf(id: string): string {
    if (!UUID_V4.test(id)) throw new Error('providerRef ต้องเป็น UUID v4');
    const dir = resolve(this.root, id.toLowerCase());
    if (!dir.startsWith(this.root + sep)) throw new Error('path อยู่นอก root ของ fake cloud');
    return dir;
  }

  private async readMeta(id: string): Promise<Meta | null> {
    try {
      return JSON.parse(await readFile(join(this.dirOf(id), META), 'utf8')) as Meta;
    } catch {
      return null;
    }
  }
}

/** ขนาดรวมของไฟล์ในโฟลเดอร์ (ไม่นับไฟล์ meta ของระบบ) */
async function sizeOf(dir: string, top: boolean): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const e of entries) {
    if (top && e.name === META) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) total += await sizeOf(p, false);
    else if (e.isFile()) total += (await stat(p)).size;
  }
  return total;
}
