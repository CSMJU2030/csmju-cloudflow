import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.use(helmet());
  app.enableCors({ origin: true, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // ยัดคีย์เกินมาใน body → 400 พร้อมบอกว่าคีย์ไหนเกิน
      // ไม่ใช่เงียบ ๆ ตัดทิ้ง ซึ่งทำให้คนยิงเข้าใจผิดว่าค่าถูกใช้
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const swagger = new DocumentBuilder()
    .setTitle('CS-CloudFlow API')
    .setDescription('ระบบขอใช้ทรัพยากรเซิร์ฟเวอร์ของนักศึกษา')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT ?? 4000);
  // ⚠️ bind 127.0.0.1 เท่านั้น — ถ้าเปลี่ยนเป็น 0.0.0.0 คนในวงเน็ตเดียวกันยิงถึงทันที
  const host = process.env.HOST ?? '127.0.0.1';

  await app.listen(port, host);
  new Logger('Bootstrap').log(`CS-CloudFlow API → http://${host}:${port}  ·  docs → /docs`);
}

bootstrap();
