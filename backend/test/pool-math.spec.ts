import { checkReservation, fullSlotsLeft, gbToMib, loadPoolConfig, mibToGb, type PoolState } from '../src/storage/pool-math';

/** กติกาแบ่งพื้นที่ 1 TB คนละไม่เกิน 15 GB — ไม่แตะฐานข้อมูลหรือ cloud */
describe('pool-math', () => {
  const TiB = gbToMib(1024);
  const GB15 = gbToMib(15);
  const pool = (reservedMib = 0): PoolState => ({ totalMib: TiB, maxPerUserMib: GB15, reservedMib });

  it('1 TiB ให้ยืมเต็ม 15 GB ได้ 68 คน', () => {
    expect(fullSlotsLeft(pool())).toBe(68);
  });

  it('จองครบ 68 คนแล้วเหลือ 4 GB — ขอ 4 GB ได้ ขอ 5 GB ไม่ได้', () => {
    const p = pool(68 * GB15);
    expect(mibToGb(TiB - 68 * GB15)).toBe(4);
    expect(checkReservation(p, gbToMib(4)).ok).toBe(true);
    const r = checkReservation(p, gbToMib(5));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('POOL_FULL');
  });

  it('จองจนเต็มพอดีได้ และหลังจากนั้นขอ 1 MiB ก็ไม่ได้', () => {
    const r = checkReservation(pool(TiB - GB15), GB15);
    expect(r.ok && r.freeAfterMib).toBe(0);
    expect(checkReservation(pool(TiB), 1).ok).toBe(false);
  });

  it('ต่อคนไม่เกิน 15 GB รวมทุกก้อนที่ยังไม่คืน', () => {
    expect(checkReservation(pool(), gbToMib(16)).ok).toBe(false);
    const r = checkReservation(pool(), gbToMib(10), gbToMib(10));
    expect(!r.ok && r.reason).toBe('OVER_USER_LIMIT');
    expect(checkReservation(pool(), gbToMib(5), gbToMib(10)).ok).toBe(true);
  });

  it('ขนาด 0 / ติดลบ / ทศนิยม ไม่รับ', () => {
    for (const q of [0, -1, 1.5]) {
      const r = checkReservation(pool(), q);
      expect(!r.ok && r.reason).toBe('INVALID_QUOTA');
    }
  });

  it('อ่านค่าจาก env · ไม่ตั้งใช้ 1 TiB / 15 GiB · ค่าผิดล้มทันที', () => {
    expect(loadPoolConfig({})).toEqual({ totalMib: TiB, maxPerUserMib: GB15 });
    expect(loadPoolConfig({ STORAGE_POOL_TOTAL_MIB: '102400', STORAGE_MAX_PER_USER_MIB: '1536' })).toEqual({
      totalMib: 102400,
      maxPerUserMib: 1536,
    });
    expect(() => loadPoolConfig({ STORAGE_POOL_TOTAL_MIB: '1TB' })).toThrow();
    expect(() => loadPoolConfig({ STORAGE_POOL_TOTAL_MIB: '100', STORAGE_MAX_PER_USER_MIB: '200' })).toThrow();
  });
});
