/**
 * สัญญาเดียวที่ระบบยืมพื้นที่ cloud รู้จัก — ไม่ผูกกับ cloud ยี่ห้อใด
 *
 * ตอนนี้ใช้ FakeStorageProvider (โฟลเดอร์ในเครื่อง) · เมื่อได้ cloud จริงให้เขียนคลาสใหม่ที่ทำตามสัญญานี้
 * แล้วเลือกด้วย env STORAGE_PROVIDER — ตรรกะธุรกิจไม่ต้องแก้
 */
export interface ProvisionInput {
  /** id ของคำขอ (UUID) — ใช้ตั้งชื่อพื้นที่ ห้ามใช้ชื่อหรืออีเมลคน */
  requestId: string;
  /** ขนาดที่อนุญาต หน่วย MiB (15 GiB = 15360) */
  quotaMib: number;
  /** วันสุดท้ายที่ใช้ได้ YYYY-MM-DD */
  expiresOn: string;
}

export interface ProvisionResult {
  /** id ของพื้นที่ฝั่ง provider — ใช้อ้างถึงพื้นที่นี้ในคำสั่งถัดไป */
  providerRef: string;
  /** ลิงก์ใช้งาน (ความลับ — ห้าม log) */
  shareUrl: string;
  /** รหัสของลิงก์ (ความลับ — ห้าม log) */
  sharePassword: string;
}

export interface StorageProvider {
  readonly name: string;
  /** สร้างพื้นที่ + ตั้ง quota + สร้างลิงก์ · เรียกซ้ำด้วย requestId เดิมต้องได้พื้นที่เดิม (idempotent) */
  provision(input: ProvisionInput): Promise<ProvisionResult>;
  /** พื้นที่ที่ใช้ไปแล้ว หน่วย MiB */
  usageMib(providerRef: string): Promise<number>;
  /** ปิดลิงก์ — ไฟล์ยังอยู่ */
  disableShare(providerRef: string): Promise<void>;
  /** ลบพื้นที่ถาวร */
  destroy(providerRef: string): Promise<void>;
  /** provider พร้อมใช้งานไหม */
  health(): Promise<boolean>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
