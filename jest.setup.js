// Native-backed SVG and the Phosphor icon set cannot render under Jest. Every
// icon becomes a plain View that records its props, so tests can assert on them.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = name => {
    const C = props => React.createElement(View, { ...props, testID: props.testID ?? name });
    C.displayName = name;
    return C;
  };
  return new Proxy(
    { __esModule: true, default: stub('Svg') },
    { get: (t, k) => (k in t ? t[k] : stub(String(k))) },
  );
});

jest.mock('phosphor-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    { __esModule: true },
    {
      get: (t, k) => {
        if (k in t) return t[k];
        const C = props =>
          React.createElement(View, { testID: `icon-${String(k)}`, ...props });
        C.displayName = String(k);
        return C;
      },
    },
  );
});

jest.mock('react-native-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: props => React.createElement(View, { testID: 'linear-gradient', ...props }),
  };
});
