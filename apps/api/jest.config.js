/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts', '<rootDir>/src/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  moduleNameMapper: { '^@kvkk/shared$': '<rootDir>/../../packages/shared/src' },
  globalSetup: '<rootDir>/test/global-setup.ts',
  // Testler gerçek veritabanıyla uçtan uca çalışır; yavaş CI makinesinde varsayılan 5 sn yetmeyebiliyor (26.11.2026).
  testTimeout: 30000,
};
