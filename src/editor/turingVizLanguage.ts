import type * as Monaco from 'monaco-editor';
import { LANGUAGE_ID } from '../tmLanguage/constants';
import { getSemanticHover, parseTuringMachine } from '../tmLanguage';
import type { Diagnostic } from '../tmLanguage';

// Monaco-specific adapter for the TuringViz DSL. All parsing and validation
// stays in tmLanguage; this file only translates domain results into Monaco
// language registration, hover text, syntax colors, and markers.
const MARKER_OWNER = 'turingviz-machine-parser';
let registered = false;

type MonacoApi = typeof Monaco;

export function registerTuringVizLanguage(monaco: MonacoApi) {
  if (registered) {
    return;
  }

  monaco.languages.register({
    id: LANGUAGE_ID,
    extensions: ['.tvm'],
    aliases: ['TuringViz Machine', 'TuringViz'],
  });

  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
    comments: {
      lineComment: '--',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['{', '}'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '"', close: '"' },
    ],
  });

  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    defaultToken: '',
    keywords: [
      'tapes',
      'blank',
      'alphabet',
      'input',
      'start',
      'state',
      'on',
      'if',
      'then',
      'and',
      'or',
      'not',
      'in',
      'any',
      'write',
      'move',
      'goto',
      'same',
      'choose',
    ],
    directions: ['L', 'R', 'S'],
    tokenizer: {
      root: [
        [/--.*$/, 'comment'],
        // Keep the tokenizer aligned with the lexer: `1/*` is a read pattern,
        // while whitespace before `/*` starts a block comment.
        [/^[ \t]*\/\*/, 'comment', '@comment'],
        [/[ \t]+\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string'],
        [
          /(\bstate\b)(\s+)([A-Za-z_][A-Za-z0-9_]*)/,
          ['keyword.header', '', 'state.identifier'],
        ],
        [
          /(\bstart\b)(\s*)(:)(\s*)([A-Za-z_][A-Za-z0-9_]*)/,
          ['keyword.header', '', 'delimiter', '', 'state.identifier'],
        ],
        [
          /(\bgoto\b)(\s+)([A-Za-z_][A-Za-z0-9_]*)/,
          ['keyword.action', '', 'state.identifier'],
        ],
        [/\b(tapes|blank|alphabet|input|start|state)\b/, 'keyword.header'],
        [/\b(on|if|then|choose)\b/, 'keyword.control'],
        [/\b(write|move|goto)\b/, 'keyword.action'],
        [/\b(and|or|not|in|any|same)\b/, 'keyword'],
        [/\b[LRS]\b/, { cases: { '@directions': 'type.identifier', '@default': '' } }],
        [/->|!=|=|!/, 'operator'],
        [/[{}[\](),/:;|]/, 'delimiter'],
        [/\*/, 'wildcard'],
        [/#/, 'constant'],
        [/[0-9]+/, 'number'],
        [/[A-Za-z_](?![A-Za-z0-9_])/, 'symbol.identifier'],
        [/[A-Za-z_][A-Za-z0-9_]*/, 'identifier'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop'],
      ],
    },
  });

  monaco.editor.defineTheme('turingviz-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword.header', foreground: '001CFF', fontStyle: 'bold' },
      { token: 'keyword.control', foreground: '001CFF' },
      { token: 'keyword.action', foreground: '001CFF' },
      { token: 'keyword', foreground: '001CFF' },
      { token: 'type.identifier', foreground: '008080', fontStyle: 'bold' },
      { token: 'state.identifier', foreground: '111111', fontStyle: 'bold' },
      { token: 'identifier', foreground: '111111' },
      { token: 'symbol.identifier', foreground: '00875A' },
      { token: 'number', foreground: '00875A' },
      { token: 'string', foreground: 'A31515' },
      { token: 'string.escape', foreground: 'A31515' },
      { token: 'constant', foreground: '00875A' },
      { token: 'wildcard', foreground: 'C00000' },
      { token: 'comment', foreground: '008000' },
      { token: 'operator', foreground: '111111' },
      { token: 'delimiter', foreground: '111111' },
    ],
    colors: {
      'editor.background': '#FBFCFF',
      'editor.foreground': '#111111',
      'editorLineNumber.foreground': '#1D7896',
      'editorLineNumber.activeForeground': '#1D7896',
      'editorCursor.foreground': '#111111',
      'editor.selectionBackground': '#D8E7F6',
      'editor.inactiveSelectionBackground': '#EAF2FA',
      'editor.lineHighlightBackground': '#F1F1F1',
      'editorWhitespace.foreground': '#D5DCE5',
      'editorIndentGuide.background1': '#E2E8F0',
      'editorIndentGuide.activeBackground1': '#B6C9DD',
      'editorGutter.background': '#FBFCFF',
      'editorBracketHighlight.foreground1': '#111111',
      'editorBracketHighlight.foreground2': '#111111',
      'editorBracketHighlight.foreground3': '#111111',
      'editorBracketHighlight.foreground4': '#111111',
      'editorBracketHighlight.foreground5': '#111111',
      'editorBracketHighlight.foreground6': '#111111',
      'editorBracketHighlight.unexpectedBracket.foreground': '#C00000',
    },
  });

  monaco.languages.registerHoverProvider(LANGUAGE_ID, {
    provideHover(model, position) {
      // Monaco positions are already 1-based, matching the domain source ranges.
      const message = getSemanticHover(
        model.getValue(),
        position.lineNumber,
        position.column,
      );

      if (!message) {
        return null;
      }

      return {
        contents: [{ value: message }],
      };
    },
  });

  registered = true;
}

export function updateTuringVizMarkers(
  monaco: MonacoApi,
  model: Monaco.editor.ITextModel | null,
) {
  if (!model) {
    return;
  }

  // Reparse the full document on every edit. The language is small enough that
  // this keeps the editor simple and avoids partial-parser state.
  const parsed = parseTuringMachine(model.getValue());
  monaco.editor.setModelMarkers(
    model,
    MARKER_OWNER,
    parsed.diagnostics.map((item) => toMarker(monaco, item)),
  );
}

function toMarker(
  monaco: MonacoApi,
  diagnostic: Diagnostic,
): Monaco.editor.IMarkerData {
  // Monaco requires a non-empty marker span; some recovery diagnostics are
  // naturally zero-width, so the end column is widened when necessary.
  return {
    severity:
      diagnostic.severity === 'warning'
        ? monaco.MarkerSeverity.Warning
        : monaco.MarkerSeverity.Error,
    message: diagnostic.message,
    code: diagnostic.code,
    startLineNumber: diagnostic.range.start.line,
    startColumn: diagnostic.range.start.column,
    endLineNumber: diagnostic.range.end.line,
    endColumn: Math.max(
      diagnostic.range.end.column,
      diagnostic.range.start.column + 1,
    ),
  };
}

export { LANGUAGE_ID };
