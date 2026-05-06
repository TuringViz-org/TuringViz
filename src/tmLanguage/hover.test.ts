import { getSemanticHover } from './index';

const hoverProgram = `tapes: 1
blank: _
alphabet: {0, " ", _}
input: ""
start: q0

state q0:
  on 0 -> move S; goto missing;
`;

describe('getSemanticHover', () => {
  it('describes header keywords', () => {
    expect(getSemanticHover(hoverProgram, 1, 2)).toContain(
      'Declares how many tapes',
    );
  });

  it('describes the relaxed input header semantics', () => {
    expect(getSemanticHover(hoverProgram, 4, 2)).toContain(
      'Missing tape segments are filled',
    );
  });

  it('describes declared states', () => {
    expect(getSemanticHover(hoverProgram, 7, 8)).toBe(
      'State `q0` declares 1 transition(s).',
    );
  });

  it('does not add semantic hover text for missing goto targets', () => {
    expect(getSemanticHover(hoverProgram, 8, 27)).toBeUndefined();
  });

  it('describes tape symbols from the alphabet', () => {
    expect(getSemanticHover(hoverProgram, 8, 6)).toBe(
      'Tape symbol `0` from the alphabet.',
    );
  });

  it('describes quoted text', () => {
    expect(getSemanticHover(hoverProgram, 3, 15)).toBe(
      'Quoted text is used for input segments and one-character symbols such as spaces.',
    );
  });

  it('describes tape references', () => {
    const program = `${hoverProgram}
state q1:
  if t1 = _ then move S; goto q0;
`;

    expect(getSemanticHover(program, 11, 6)).toBe(
      'Tape reference `t1`. Tape indexes start at 1.',
    );
  });

  it('describes existing goto targets', () => {
    const program = `${hoverProgram}
state q1:
  on _ -> move S; goto q0;
`;

    expect(getSemanticHover(program, 11, 25)).toBe('Goto target state `q0`.');
  });

  it('returns undefined for whitespace and unknown symbols', () => {
    const program = `tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on x -> move S; goto q0;
`;

    expect(getSemanticHover(hoverProgram, 6, 1)).toBeUndefined();
    expect(getSemanticHover(program, 8, 6)).toBeUndefined();
  });

  it('describes movement keywords', () => {
    expect(getSemanticHover(hoverProgram, 8, 16)).toBe(
      'Keep this tape head on the current cell.',
    );
  });
});
