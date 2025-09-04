import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '../messaging/messaging.module';
import { VectorsModule } from '../vectors/vectors.module';
import { InitializationService } from './initialization.service';

@Module({
  imports: [TypeOrmModule.forFeature(), MessagingModule, VectorsModule],
  providers: [InitializationService],
  exports: [InitializationService],
})
export class InitializationModule {}
