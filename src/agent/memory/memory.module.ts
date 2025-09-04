import { Module } from '@nestjs/common';
import { DatabaseConfigModule } from '../../infisical/database-config.module';
import { VectorsModule } from '../../vectors/vectors.module';
import { MemoryService } from './memory.service';

@Module({
  imports: [VectorsModule, DatabaseConfigModule],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
