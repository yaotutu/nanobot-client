module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/__native_tests__/**/*.test.ts', '<rootDir>/__native_tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/__native_tests__/setup.ts'],
  clearMocks: true,
};
