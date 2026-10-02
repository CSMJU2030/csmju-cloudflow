import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';

import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config/configuration';
import { EnvelopeInterceptor } from './common/envelope.interceptor';
import { validation } from './common/errors';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { logEvent } from './common/logger';

export async function createApp() {
  // logger ของ Nest ปิดไว้ — ใช้ structured log ของเราเอง (logging.md) ซึ่งไม่ log URL ที่มี query
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  const config = app.get<AppConfig>(APP_CONFIG);

  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  express.set('trust proxy', 'loopback');

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // ธุรกิจอยู่ใต้ /api/v1 · health อยู่ /api/health · SSO 3 path อยู่นอก /api (api-conventions ข้อ 1)
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'auth/login', method: RequestMethod.GET },
      { path: 'auth/callback', method: RequestMethod.GET },
      { path: 'auth/logout', method: RequestMethod.POST },
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // คีย์เกินใน body/query → 400 แทนการตัดทิ้งเงียบ ๆ
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        validation(
          'ข้อมูลที่ส่งมาไม่ผ่านการตรวจสอบ',
          errors.flatMap((e) =>
            e.constraints ? Object.values(e.constraints) : [`${e.property} ไม่ถูกต้อง`],
          ),
        ),
    }),
  );
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  if (!config.isProduction) {
    const doc = new DocumentBuilder()
      .setTitle('CS-CloudFlow API')
      .setDescription('ระบบขอใช้ทรัพยากรเซิร์ฟเวอร์ของนักศึกษา · token มาจาก Core Hub SSO')
      .setVersion('2.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }

  return { app, config };
}

async function bootstrap() {
  const { app, config } = await createApp();
  // bind 127.0.0.1 — ผู้ใช้เข้าผ่าน frontend (ประตูเดียวของระบบ) ที่ proxy มาที่นี่
  await app.listen(config.port, config.host);
  logEvent('subsystem.started', {
    subsystem: config.subsystemId,
    port: config.port,
    coreHubUrl: config.coreHubUrl,
    jwksUrl: config.jwksUrl,
    issuer: config.issuer,
    audience: config.audience,
  });
}

if (require.main === module) {
  void bootstrap();
}
