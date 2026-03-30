// Custom syntax theme — Catppuccin Mocha palette
// Warm, high-contrast, easy on eyes

export const codeTheme = {
  'code[class*="language-"]': {
    color: '#cdd6f4',
    background: 'none',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: '0.85rem',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    wordWrap: 'normal',
    lineHeight: '1.8',
    tabSize: 2,
    hyphens: 'none',
  },
  'pre[class*="language-"]': {
    color: '#cdd6f4',
    background: '#11131f',
    padding: '1.5rem',
    margin: 0,
    overflow: 'auto',
    borderRadius: 0,
  },
  ':not(pre) > code[class*="language-"]': {
    background: '#1e2030',
    borderRadius: '0.25em',
    padding: '0.1em 0.3em',
    whiteSpace: 'normal',
  },
  // Comments — muted overlay
  'comment': { color: '#6c7086', fontStyle: 'italic' },
  'block-comment': { color: '#6c7086', fontStyle: 'italic' },
  'prolog': { color: '#6c7086' },
  'doctype': { color: '#6c7086' },
  'cdata': { color: '#6c7086' },
  // Punctuation
  'punctuation': { color: '#9399b2' },
  // Namespace
  'namespace': { opacity: 0.7 },
  // Keywords — mauve/purple
  'keyword': { color: '#cba6f7' },
  'tag': { color: '#cba6f7' },
  'selector': { color: '#cba6f7' },
  'important': { color: '#cba6f7', fontWeight: 'bold' },
  'atrule': { color: '#cba6f7' },
  // Operators & misc
  'operator': { color: '#89dceb' },
  'symbol': { color: '#89dceb' },
  'builtin': { color: '#f9e2af' },
  'entity': { color: '#f9e2af' },
  'url': { color: '#f9e2af' },
  // Strings — green
  'string': { color: '#a6e3a1' },
  'char': { color: '#a6e3a1' },
  'attr-value': { color: '#a6e3a1' },
  // Numbers/booleans — peach
  'number': { color: '#fab387' },
  'boolean': { color: '#fab387' },
  // Functions — blue
  'function': { color: '#89b4fa' },
  'function-name': { color: '#89b4fa' },
  // Class names — red/pink
  'class-name': { color: '#f38ba8' },
  // Regex — pink
  'regex': { color: '#f38ba8' },
  // Variables
  'variable': { color: '#cdd6f4' },
  // Properties/attribute names
  'property': { color: '#89b4fa' },
  'attr-name': { color: '#89b4fa' },
  // Deleted / inserted (diff)
  'deleted': { color: '#f38ba8', background: 'rgba(243,139,168,0.1)' },
  'inserted': { color: '#a6e3a1', background: 'rgba(166,227,161,0.1)' },
  // Bold/italic
  'bold': { fontWeight: 'bold' },
  'italic': { fontStyle: 'italic' },
  // Pseudo-elements
  'pseudo-class': { color: '#94e2d5' },
  'pseudo-element': { color: '#94e2d5' },
  // Constants
  'constant': { color: '#fab387' },
  // Type annotations
  'type-annotation': { color: '#f9e2af' },
  'annotation': { color: '#f9e2af' },
  'parameter': { color: '#cdd6f4' },
  // Generics
  'generic': { color: '#f38ba8' },
  // Decorators
  'decorator': { color: '#f9e2af' },
  // CSS-specific
  'unit': { color: '#fab387' },
  'hex-color': { color: '#a6e3a1' },
  // Markdown specific
  'title': { color: '#89b4fa', fontWeight: 'bold' },
  'code': { color: '#a6e3a1' },
  'list': { color: '#cdd6f4' },
  // YAML
  'key': { color: '#f38ba8' },
  'value': { color: '#a6e3a1' },
  // Shell
  'command': { color: '#89b4fa' },
  'flag': { color: '#89dceb' },
  // Interpolation
  'interpolation': { color: '#89dceb' },
  'interpolation-punctuation': { color: '#89dceb' },
  // Template literal
  'template-literal': { color: '#a6e3a1' },
  'template-punctuation': { color: '#cba6f7' },
  // Namespace
  'namespace-declaration': { color: '#f38ba8' },
}
