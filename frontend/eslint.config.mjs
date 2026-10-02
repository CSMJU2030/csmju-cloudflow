import next from 'eslint-config-next';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...next,
  {
    rules: {
      // หน้าใน (app) โหลดข้อมูลตอน mount ด้วย useEffect แบบ client component — เป็นรูปแบบที่ตั้งใจ
      // (ข้อมูลต้องมาจาก API ของระบบที่ใช้คุกกี้ session) จึงลดเป็นคำเตือน
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];
