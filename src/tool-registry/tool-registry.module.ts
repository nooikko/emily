import { Global, Module } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { CalculatorTool, MathTools } from './examples/calculator.tool';
import { ToolDiscoveryService } from './services/tool-discovery.service';
import { ToolRegistryService } from './services/tool-registry.service';

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
