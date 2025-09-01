import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from './agent/agent.module';
import { ApiModule } from './api/api.module';
import { MessagingModule } from './messaging/messaging.module';
import { VectorsModule } from './vectors/vectors.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    VectorsModule,
    MessagingModule,
    AgentModule,
    ApiModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
