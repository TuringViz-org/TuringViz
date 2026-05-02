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
        [/\b(tapes|blank|alphabet|input|start|state)\b/, 'keyword.header'],
        [
          /\b(on|if|then|and|or|not|in|any|write|move|goto|same|choose)\b/,
          'keyword',
        ],
        [/\b[LRS]\b/, { cases: { '@directions': 'type.identifier', '@default': '' } }],
        [/->|!=|=|!/, 'operator'],
        [/[{}[\](),/:;|]/, 'delimiter'],
        [/#|\*/, 'constant'],
        [/[0-9]+/, 'number'],
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

  monaco.editor.defineTheme('turingviz-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword.header', foreground: '4FC1FF', fontStyle: 'bold' },
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'type.identifier', foreground: 'DCDCAA', fontStyle: 'bold' },
      { token: 'constant', foreground: 'B5CEA8' },
      { token: 'operator', foreground: 'D4D4D4' },
      { token: 'delimiter', foreground: '808080' },
    ],
    colors: {
      'editor.background': '#101418',
      'editorLineNumber.foreground': '#5f6b7a',
      'editorLineNumber.activeForeground': '#c8d1dc',
      'editorCursor.foreground': '#f2cc60',
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
