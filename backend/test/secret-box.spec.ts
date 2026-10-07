import { randomBytes } from 'node:crypto';

import { SecretBox } from '../src/storage/secret-box';

describe('SecretBox (AES-256-GCM)', () => {
  const key = randomBytes(32).toString('base64');
  const box = new SecretBox(key);
  const id = '6f1c2f8e-0d55-4b8e-9c7a-1d1f2b3c4d5e';

  it('เข้ารหัสแล้วถอดกลับได้ และไม่มีข้อความเดิมหลุดในค่าที่เก็บ', () => {
    const sealed = box.seal('https://cloud.example/s/AbC123', id);
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain('cloud.example');
    expect(box.open(sealed, id)).toBe('https://cloud.example/s/AbC123');
  });

  it('เข้ารหัสข้อความเดิมสองครั้งได้ค่าไม่ซ้ำกัน (iv สุ่ม)', () => {
    expect(box.seal('x', id)).not.toBe(box.seal('x', id));
  });

  it('ย้ายค่าไปแถวอื่น / กุญแจผิด / ข้อมูลถูกแก้ → ถอดไม่ได้', () => {
    const sealed = box.seal('secret', id);
    expect(() => box.open(sealed, 'another-row')).toThrow('ถอดรหัสไม่สำเร็จ');
    expect(() => new SecretBox(randomBytes(32).toString('base64')).open(sealed, id)).toThrow('ถอดรหัสไม่สำเร็จ');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => box.open(parts.join('.'), id)).toThrow();
  });

  it('กุญแจต้องยาว 32 ไบต์ และต้องตั้ง env', () => {
    expect(() => new SecretBox(randomBytes(16).toString('base64'))).toThrow('32 ไบต์');
    expect(() => SecretBox.fromEnv({})).toThrow('STORAGE_SECRET_KEY');
    expect(SecretBox.fromEnv({ STORAGE_SECRET_KEY: key })).toBeInstanceOf(SecretBox);
  });
});
