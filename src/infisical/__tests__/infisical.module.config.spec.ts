import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { InfisicalModule } from '../infisical.module';
import { InfisicalService } from '../infisical.service';

// Mock the InfisicalSDK to prevent actual network calls
jest.mock('@infisical/sdk', () => ({
  InfisicalSDK: jest.fn().mockImplementation(() => {
    const mockSecretsClient = {
      listSecrets: jest.fn(),
      getSecret: jest.fn(),
      listSecretsWithImports: jest.fn(),
      updateSecret: jest.fn(),
      createSecret: jest.fn(),
      deleteSecret: jest.fn(),
    };

    const mockAuthClient = {
      universalAuth: {
        login: jest.fn(),
        renew: jest.fn(),
      },
      awsIamAuth: {
        login: jest.fn(),
        renew: jest.fn(),
      },
      getAccessToken: jest.fn(),
      accessToken: jest.fn(),
    };

    return {
      auth: jest.fn(() => mockAuthClient),
      secrets: jest.fn(() => mockSecretsClient),
    };
  }),
}));

describe('InfisicalModule - Configuration Tests', () => {
  describe('Module with custom configuration', () => {
    let customModule: TestingModule;
    let customInfisicalService: InfisicalService;

    beforeAll(async () => {
      // Test with enabled Infisical configuration
      customModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            load: [
              () => ({
                INFISICAL_ENABLED: true,
                INFISICAL_CLIENT_ID: 'test-client-id',
                INFISICAL_CLIENT_SECRET: 'test-client-secret',
                INFISICAL_PROJECT_ID: 'test-project-id',
                INFISICAL_ENVIRONMENT: 'test',
                INFISICAL_CACHE_TTL: '600000',
                INFISICAL_FALLBACK_TO_ENV: 'false',
              }),
            ],
          }),
          InfisicalModule,
        ],
      }).compile();

      customInfisicalService = customModule.get<InfisicalService>(InfisicalService);
    });

    afterAll(async () => {
      await customModule.close();
    });

    it('should create service with enabled configuration', () => {
      const config = customInfisicalService.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.clientId).toBe('test-client-id');
      expect(config.projectId).toBe('test-project-id');
      expect(config.environment).toBe('test');
      expect(config.cacheTtl).toBe(600000);
      expect(config.fallbackToEnv).toBe(false);
    });

    it('should not expose sensitive configuration', () => {
      const config = customInfisicalService.getConfig();

      expect(config).not.toHaveProperty('clientSecret');
    });
  });

  describe('Module integration with ConfigModule', () => {
    let integrationModule: TestingModule;

    afterEach(async () => {
      if (integrationModule) {
        await integrationModule.close();
      }
    });

    it('should work without explicit ConfigModule import', async () => {
      // ConfigModule is imported by InfisicalModule
      integrationModule = await Test.createTestingModule({
        imports: [InfisicalModule],
      }).compile();

      const configService = integrationModule.get<ConfigService>(ConfigService);
      const infisicalService = integrationModule.get<InfisicalService>(InfisicalService);

      expect(configService).toBeDefined();
      expect(infisicalService).toBeDefined();
    });

    it('should use provided ConfigModule configuration', async () => {
      const customConfig = {
        INFISICAL_ENABLED: true,
        INFISICAL_CACHE_TTL: '900000',
        CUSTOM_VALUE: 'test-value',
      };

      integrationModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            load: [() => customConfig],
          }),
          InfisicalModule,
        ],
      }).compile();

      const configService = integrationModule.get<ConfigService>(ConfigService);
      const infisicalService = integrationModule.get<InfisicalService>(InfisicalService);

      expect(configService.get('CUSTOM_VALUE')).toBe('test-value');

      const infisicalConfig = infisicalService.getConfig();
      expect(infisicalConfig.enabled).toBe(true);
      expect(infisicalConfig.cacheTtl).toBe(900000);
    });
  });

  describe('Error handling in module initialization', () => {
    it('should throw error when configuration is invalid', async () => {
      // This test verifies that the module throws when invalid config is provided
      // The validation happens in the service constructor
      await expect(async () => {
        const testModule = await Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              load: [
                () => ({
                  INFISICAL_CACHE_TTL: 'invalid-number',
                }),
              ],
            }),
            InfisicalModule,
          ],
        }).compile();

        await testModule.close();
      }).rejects.toThrow('Invalid INFISICAL_CACHE_TTL value: invalid-number. Must be a positive number.');
    });
  });
});
