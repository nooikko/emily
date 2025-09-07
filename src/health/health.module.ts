import { Module } from '@nestjs/common';
import { InfisicalModule } from '../infisical/infisical.module';
import { InitializationModule } from '../initialization/initialization.module';
import { MessagingModule } from '../messaging/messaging.module';
import { VectorsModule } from '../vectors/vectors.module';
import { HealthController } from './health.controller';

@Module({
  imports: [InitializationModule, InfisicalModule, MessagingModule, VectorsModule],
  controllers: [HealthController],
})
export class HealthModule {}
