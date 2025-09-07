import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InfisicalModule } from '../infisical/infisical.module';
import { MessagingModule } from '../messaging/messaging.module';
import { VectorsModule } from '../vectors/vectors.module';
import { InitializationService } from './initialization.service';

@Module({
  imports: [TypeOrmModule.forFeature(), MessagingModule, VectorsModule, InfisicalModule],
  providers: [InitializationService],
  exports: [InitializationService],
})
export class InitializationModule {}
