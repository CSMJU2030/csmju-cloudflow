import Link from 'next/link';

/**
 * ปลายทางของลิงก์จาก cloud จำลอง (STORAGE_PROVIDER=fake) — ใช้ตอนพัฒนาเท่านั้น
 * เมื่อเปลี่ยนเป็น cloud จริง (เช่น Nextcloud) ลิงก์จะพาไปหน้า drive ของ cloud นั้นแทน และหน้านี้ไม่ถูกใช้
 */
export default async function DevStoragePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>พื้นที่จำลอง (fake cloud)</h2>
        <p>
          ลิงก์นี้มาจาก cloud จำลองสำหรับทดสอบระบบ ไฟล์อยู่ในเครื่องที่รัน backend ที่โฟลเดอร์
        </p>
        <p className="mono" style={{ wordBreak: 'break-all' }}>
          STORAGE_FAKE_ROOT\{id}
        </p>
        <p className="muted">
          ลองวางไฟล์ลงโฟลเดอร์นั้น แล้วให้ผู้ดูแลกด “อัปเดตขนาดที่ใช้” ที่หน้า Cloud Storage — ขนาดจะขึ้นในหน้าคำขอ
          <br />
          เมื่อได้ cloud จริง ลิงก์จะพาไปหน้า drive ของ cloud นั้นแทนหน้านี้
        </p>
        <Link className="btn btn-primary btn-block" href={`/storage/${id}`}>
          กลับไปหน้าคำขอ
        </Link>
      </div>
    </div>
  );
}
