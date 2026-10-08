#!/bin/sh
# จุดเริ่มของ api ใน container — deployment.md ข้อ 3.4 และ 4.1
# migrate deploy เท่านั้น (ห้าม migrate dev · db push · seed) แล้วเปิด server แทน process นี้
set -eu

echo '{"event":"subsystem.migrate","step":"prisma migrate deploy"}'
node node_modules/prisma/build/index.js migrate deploy

exec node dist/main.js
