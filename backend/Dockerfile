# api ของ CS-CloudFlow (NestJS + Prisma 7) — standards docs/deployment.md ข้อ 3
# build จากรากของ repo เพราะ pnpm workspace เก็บ lockfile ไว้ที่ราก:
#   docker build -f backend/Dockerfile -t csmju-cloudflow-api .
#
# - ห้ามใส่ secret ใน ARG / ENV — ค่าจริงทุกตัวมาจาก env ตอนรัน (deployment.md ข้อ 4.2)
# - ตอนสตาร์ต: prisma migrate deploy แล้ว node dist/main.js (backend/docker/entrypoint.sh)
# - container อ่านอย่างเดียว เขียนได้แค่ /tmp — cloud จำลอง (STORAGE_PROVIDER=fake) จึงเก็บไฟล์ใน /tmp

# ---------- build stage ----------
FROM node:22-alpine AS builder

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile --filter backend...

COPY backend/ backend/
# prisma generate ไม่ต่อฐาน — DATABASE_URL ว่างได้ (prisma.config.ts)
RUN pnpm --filter backend build

# ---------- runtime stage ----------
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PORT=4000 \
    HOST=0.0.0.0 \
    TZ=Asia/Bangkok

RUN apk add --no-cache tzdata && corepack enable pnpm

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/
# ติดตั้งเฉพาะ dependency ของ runtime (prisma CLI อยู่ใน dependencies เพื่อรัน migrate deploy)
# ไม่ใส่ --ignore-scripts: @prisma/engines ต้องดาวน์โหลด engine ตอนนี้ (deployment.md ข้อ 3.4)
# ลบ store/cache ของ pnpm ใน RUN เดียวกัน ไม่ให้ติดไปใน image
RUN pnpm install --frozen-lockfile --prod --filter backend... \
 && rm -rf /root/.local/share/pnpm /root/.cache /tmp/* \
 && corepack disable

COPY --from=builder /app/backend/dist backend/dist
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/
COPY backend/docker/entrypoint.sh backend/docker/entrypoint.sh

WORKDIR /app/backend
USER node
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["sh", "docker/entrypoint.sh"]
