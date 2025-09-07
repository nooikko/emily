import { Module } from '@nestjs/common';
import { DatabaseConfigModule } from '../../infisical/database-config.module';
import { ThreadsModule } from '../../threads/threads.module';
import { VectorsModule } from '../../vectors/vectors.module';
import { MemoryService } from './memory.service';

@Module({
  imports: [
    VectorsModule,
    DatabaseConfigModule,
    // Import ThreadsModule to enable auto-thread creation integration
    ThreadsModule,
  ],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
