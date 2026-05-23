import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { OpenAPIObject } from '@nestjs/swagger'
import { AppModule } from './app/app.module'
import { NestiaSwaggerComposer } from '@nestia/sdk'
import { SwaggerModule } from '@nestjs/swagger'
import { WebSocketAdaptor } from '@nestia/core'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })

  const globalPrefix = 'api'
  app.setGlobalPrefix(globalPrefix)

  if (process.env.NODE_ENV !== 'production') {
    const document = await NestiaSwaggerComposer.document(app, {})
    SwaggerModule.setup('swagger-doc', app, document as OpenAPIObject)
  }

  await WebSocketAdaptor.upgrade(app)
  const port = process.env.BACKEND_PORT || 3000
  await app.listen(port)
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`)
  if (process.env['MOCK_EMBEDDINGS'] === 'true') {
    Logger.warn(
      'MOCK_EMBEDDINGS=true: RAG uses token-hash vectors (not Gemini). Chat answers and retrieved chunks may be inaccurate.',
    )
  }
}

bootstrap()
