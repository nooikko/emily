module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.spec.ts$',
  maxWorkers: '75%', // Use 24 cores
  workerIdleMemoryLimit: '2GB',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/'],
  // Allow transformation of ES modules from specific packages
  transformIgnorePatterns: ['node_modules/(?!(@xenova/transformers|@langchain|langsmith)/)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  forceExit: true,
  detectOpenHandles: false,
  // Suppress console output by default for cleaner test runs
  silent: false,
  // Set test timeout to 60 seconds (60,000 ms)
  testTimeout: 60000,
  reporters: [
    [
      'default',
      {
        summaryThreshold: 0,
      },
    ],
  ],
};
