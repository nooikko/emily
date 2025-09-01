import { Module } from '@nestjs/common';
import { VectorsModule } from '../../vectors/vectors.module';
import { MemoryService } from './memory.service';

@Module({
  imports: [VectorsModule],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
