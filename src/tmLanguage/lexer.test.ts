import { lexTuringMachine } from './index';

describe('lexTuringMachine', () => {
  it('emits newline tokens while dropping line comments', () => {
    const result = lexTuringMachine(`tapes: 1 -- ignored
blank: _
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map((token) => token.value)).toEqual([
      'tapes',
      ':',
      '1',
      '\n',
      'blank',
      ':',
      '_',
      '\n',
      '',
    ]);
  });

  it('drops block comments and keeps following tokens aligned', () => {
    const result = lexTuringMachine(`tapes: /* comment
with newline */ 1`);

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map((token) => token.value)).toEqual([
      'tapes',
      ':',
      '1',
      '',
    ]);
    expect(result.tokens[2].range.start.line).toBe(2);
  });

  it('treats slash-star inside a read pattern as punctuation plus wildcard', () => {
    const result = lexTuringMachine('on 1/* -> move R/S;');

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map((token) => token.value)).toEqual([
      'on',
      '1',
      '/',
      '*',
      '->',
      'move',
      'R',
      '/',
      'S',
      ';',
      '',
    ]);
  });

  it('marks string tokens as quoted and stores the unescaped value', () => {
    const result = lexTuringMachine('input: "\\"";');
    const stringToken = result.tokens.find((token) => token.kind === 'string');

    expect(result.diagnostics).toEqual([]);
    expect(stringToken).toMatchObject({
      kind: 'string',
      value: '"',
      quoted: true,
    });
  });

  it('emits two-character operators as single tokens', () => {
    const result = lexTuringMachine('if t1 != _ then move S;');

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map((token) => token.value)).toContain('!=');
    expect(result.tokens.filter((token) => token.value === '!')).toEqual([]);
  });
});
