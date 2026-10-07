import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * กล่องเข้ารหัสลิงก์/รหัสของพื้นที่ cloud ก่อนเก็บลงฐาน — AES-256-GCM (node:crypto · ไม่ต้องลง package เพิ่ม)
 *
 * - กุญแจมาจาก env STORAGE_SECRET_KEY (base64 ของ 32 ไบต์) · ห้าม commit · ทำหายแล้วถอดลิงก์เดิมไม่ได้
 * - ผูกข้อความกับ id ของคำขอ (AAD) — ย้ายค่าที่เข้ารหัสไปใส่แถวอื่นแล้วจะถอดไม่ออก
 * - รูปแบบที่เก็บ: v1.<iv>.<tag>.<ciphertext> (base64url ทุกส่วน)
 *
 * สร้างกุญแจ: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key.trim(), 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error('STORAGE_SECRET_KEY ต้องเป็น base64 ของ 32 ไบต์ (ดูวิธีสร้างใน secret-box.ts)');
    }
    this.key = key;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): SecretBox {
    const raw = env.STORAGE_SECRET_KEY?.trim();
    if (!raw) throw new Error('ต้องตั้งค่า STORAGE_SECRET_KEY ใน backend/.env ก่อนเปิดระบบยืมพื้นที่');
    return new SecretBox(raw);
  }

  seal(plain: string, boundTo: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(boundTo, 'utf8'));
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), ct].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
  }

  /** ถอดไม่ได้ (กุญแจผิด · ข้อมูลถูกแก้ · ผิดแถว) → throw โดยไม่บอกรายละเอียด */
  open(sealed: string, boundTo: string): string {
    const parts = sealed.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('รูปแบบข้อมูลที่เข้ารหัสไม่ถูกต้อง');
    const [, iv, tag, ct] = parts.map((p) => Buffer.from(p, 'base64url'));
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(Buffer.from(boundTo, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('ถอดรหัสไม่สำเร็จ');
    }
  }
}
