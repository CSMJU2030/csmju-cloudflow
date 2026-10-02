/**
 * structured log — JSON บรรทัดเดียว ตาม standards/docs/logging.md
 *
 * ชื่อ event และ reason เป็นรายการปิดใน standards/contracts/log-events.json
 * ห้ามส่ง token · header Authorization/Cookie · URL ที่มี query · ชื่อ/อีเมลเข้ามาที่นี่
 * ระบุตัวผู้ใช้ด้วย `sub` อย่างเดียว
 */
export type LogEvent =
  | 'subsystem.started'
  | 'jwks.refresh'
  | 'jwks.refresh.failure'
  | 'jwks.unknown_kid'
  | 'jwt.verification.success'
  | 'jwt.verification.failure'
  | 'authorization.role_mapping_failed'
  | 'authorization.denied'
  | 'core_data.refresh.failure'
  | 'request.error';

export function logEvent(event: LogEvent, fields: Record<string, unknown> = {}): void {
  if (process.env.LOG_SILENT === '1') return;
  const line = JSON.stringify({ event, ...fields, at: new Date().toISOString() });
  if (event.endsWith('failure') || event === 'request.error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}
