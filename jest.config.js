module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  forceExit: true,
  detectOpenHandles: false,
  // Suppress console output by default for cleaner test runs
  silent: true,
  reporters: [
    [
      'default',
      {
        summaryThreshold: 0,
      },
    ],
  ],
};
