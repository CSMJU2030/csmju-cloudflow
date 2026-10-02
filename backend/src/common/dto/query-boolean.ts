import { Transform } from 'class-transformer';

/** query string "true"/"false" → boolean (ค่าอื่นปล่อยผ่านให้ @IsBoolean ตอบ 400) */
export const QueryBoolean = () =>
  Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value));
