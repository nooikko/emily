import { Test, type TestingModule } from '@nestjs/testing';
import { AgentService } from '../service/agent/agent.service';
import { AgentController } from './agent.controller';

describe('AgentController', () => {
  let controller: AgentController;
  let _agentService: AgentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        {
          provide: AgentService,
          useValue: {
            chat: jest.fn(),
            stream: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AgentController>(AgentController);
    _agentService = module.get<AgentService>(AgentService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
