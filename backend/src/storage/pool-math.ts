/**
 * ตัวคำนวณพื้นที่รวมของ cloud (pool) — ฟังก์ชันล้วน ไม่แตะฐานข้อมูลหรือ cloud
 *
 * หน่วยภายในเป็น MiB แบบจำนวนเต็ม (1 GiB = 1024 MiB · 1 TiB = 1,048,576 MiB)
 * ไม่ใช้ทศนิยม และไม่ต้องใช้ BigInt
 */
export const MIB_PER_GIB = 1024;

export interface PoolConfig {
  /** พื้นที่รวมที่ยอมให้ยืม (กันพื้นที่ระบบออกแล้ว) */
  totalMib: number;
  /** สูงสุดต่อคน */
  maxPerUserMib: number;
}

export interface PoolState extends PoolConfig {
  /** จองไปแล้ว (คำขอที่อนุมัติแล้วและยังไม่คืน) */
  reservedMib: number;
}

export type ReservationCheck =
  | { ok: true; freeAfterMib: number }
  | { ok: false; reason: 'INVALID_QUOTA'; message: string }
  | { ok: false; reason: 'OVER_USER_LIMIT'; message: string; allowedMib: number }
  | { ok: false; reason: 'POOL_FULL'; message: string; freeMib: number };

export const gbToMib = (gb: number) => Math.round(gb * MIB_PER_GIB);
export const mibToGb = (mib: number) => Math.round((mib / MIB_PER_GIB) * 100) / 100;

export function freeMib(pool: PoolState): number {
  return Math.max(0, pool.totalMib - pool.reservedMib);
}

/** ยังให้ยืมเต็มขนาด (max ต่อคน) ได้อีกกี่ที่ */
export function fullSlotsLeft(pool: PoolState): number {
  return Math.floor(freeMib(pool) / pool.maxPerUserMib);
}

/**
 * ตรวจว่าจองพื้นที่ได้ไหม — ใช้ตอนอาจารย์อนุมัติ
 * @param quotaMib ขนาดที่คำขอนี้ขอ
 * @param userReservedMib ที่ผู้ใช้คนนี้จองอยู่แล้ว (คำขออื่นที่ยังไม่คืน)
 */
export function checkReservation(pool: PoolState, quotaMib: number, userReservedMib = 0): ReservationCheck {
  if (!Number.isInteger(quotaMib) || quotaMib <= 0) {
    return { ok: false, reason: 'INVALID_QUOTA', message: 'ขนาดที่ขอต้องเป็นจำนวนเต็มมากกว่า 0' };
  }

  const allowedMib = Math.max(0, pool.maxPerUserMib - userReservedMib);
  if (quotaMib > allowedMib) {
    return {
      ok: false,
      reason: 'OVER_USER_LIMIT',
      message: `ยืมได้ไม่เกิน ${mibToGb(pool.maxPerUserMib)} GB ต่อคน (ขอเพิ่มได้อีก ${mibToGb(allowedMib)} GB)`,
      allowedMib,
    };
  }

  const free = freeMib(pool);
  if (quotaMib > free) {
    return {
      ok: false,
      reason: 'POOL_FULL',
      message: `พื้นที่รวมเหลือ ${mibToGb(free)} GB ไม่พอกับที่ขอ ${mibToGb(quotaMib)} GB`,
      freeMib: free,
    };
  }

  return { ok: true, freeAfterMib: free - quotaMib };
}

/** อ่านค่าจาก env — ไม่ตั้ง = 1 TiB และ 15 GiB · ค่าผิดรูปแบบ = ล้มตอนบูต */
export function loadPoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const read = (key: string, fallback: number) => {
    const raw = env[key];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${key} ต้องเป็นจำนวนเต็มมากกว่า 0 (หน่วย MiB)`);
    return n;
  };
  const totalMib = read('STORAGE_POOL_TOTAL_MIB', 1024 * MIB_PER_GIB);
  const maxPerUserMib = read('STORAGE_MAX_PER_USER_MIB', 15 * MIB_PER_GIB);
  if (maxPerUserMib > totalMib) throw new Error('STORAGE_MAX_PER_USER_MIB ต้องไม่เกิน STORAGE_POOL_TOTAL_MIB');
  return { totalMib, maxPerUserMib };
}
