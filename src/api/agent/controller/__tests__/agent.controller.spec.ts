import { Test, type TestingModule } from '@nestjs/testing';
import { AgentService } from '../../service/agent/agent.service';
import { AgentController } from '../agent.controller';

describe('AgentController', () => {
  let controller: AgentController;
  let _agentService: AgentService;

  beforeEach(async () => {
    const mockAgentService = {
      chat: jest.fn(),
      stream: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [],
      providers: [
        {
          provide: AgentController,
          useFactory: () => new AgentController(mockAgentService as any),
        },
        {
          provide: AgentService,
          useValue: mockAgentService,
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
