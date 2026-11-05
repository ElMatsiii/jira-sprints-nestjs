/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          target: 'ES2022',
          emitDecoratorMetadata: true,
          experimentalDecorators: true,
          skipLibCheck: true,
        },
        diagnostics: {
          ignoreCodes: [151002],
        },
      },
    ],
  },
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.dto.ts',
    '!src/db/migrations/**',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: './coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'json',
    'json-summary',
    'clover',
  ],
  coverageThreshold: {
    global: {
      statements: 60.0,
      branches: 60.0,
      functions: 60.0,
      lines: 60.0,
    },
  },
  testEnvironment: 'node',
  verbose: true,
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
};
