import { Module, Global } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { ToolRegistryService } from './services/tool-registry.service';
import { ToolDiscoveryService } from './services/tool-discovery.service';
import { CalculatorTool, MathTools } from './examples/calculator.tool';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    ToolRegistryService,
    ToolDiscoveryService,
    DiscoveryService,
    // Example tools - these would normally be in separate modules
    CalculatorTool,
    MathTools,
  ],
  exports: [ToolRegistryService, ToolDiscoveryService],
})
export class ToolRegistryModule {}