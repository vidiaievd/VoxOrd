// No official types package exists for react-native-markdown-display (checked
// npm — no @types/react-native-markdown-display). Minimal shape for what this
// app actually uses: rendering a markdown string with theme-driven styles.
declare module 'react-native-markdown-display' {
  import type { Component } from 'react';
  import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

  export interface MarkdownProps {
    children: string;
    style?: Record<string, StyleProp<ViewStyle | TextStyle>>;
  }

  export default class Markdown extends Component<MarkdownProps> {}
}
