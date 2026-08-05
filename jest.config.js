module.exports = {
  preset: 'react-native',
  // The react-native preset only transforms react-native/@react-native(-community)
  // packages by default. Some deps we use ship ESM-only builds in node_modules
  // (e.g. @op-engineering/op-sqlite, @react-native-async-storage/async-storage)
  // and must be transpiled too, or Jest fails on their `import` statements.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage|@op-engineering)/)',
  ],
};
