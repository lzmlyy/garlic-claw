/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  setupFilesAfterEnv: ['<rootDir>/test-setup.ts'],
  coverageDirectory: '../coverage',
  collectCoverageFrom: ['**/*.service.ts', '**/*.controller.ts'],
};
