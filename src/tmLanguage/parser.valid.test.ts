import { expectValidMachine } from './testUtils';

describe('parseTuringMachine valid programs', () => {
  it('parses a compact multi-tape program with comments', () => {
    const machine = expectValidMachine(`-- A small two-tape machine.
tapes: 2
blank: _
alphabet: {0, 1, #, _}
input: "10" | ""
start: scan

/* State comments may span
   multiple lines. */
state scan:
  on 1/* -> write same/1; move R/R; goto scan;
  if t1 = _ and t2 not in {#} then choose {
    write same/#; move S/R; goto accept;
    write same/0; move S/R; goto reject;
  }

state accept:

state reject:
`);

    expect(machine).toMatchObject({
      tapes: 2,
      blank: '_',
      input: ['10', ''],
      start: 'scan',
      states: ['scan', 'accept', 'reject'],
    });
    expect(machine.transitions).toHaveLength(3);
    expect(machine.transitions[1]).toMatchObject({
      from: 'scan',
      to: 'accept',
      read: [['_'], ['0', '1', '_']],
      write: ['same', '#'],
      move: ['S', 'R'],
    });
  });

  it('pads omitted input tapes with the blank symbol', () => {
    const machine = expectValidMachine(`tapes: 3
blank: _
alphabet: {0, 1, _}
input: "10"
start: q0

state q0:
  on 1/_/_ -> move S/S/S; goto done;

state done:
`);

    expect(machine.input).toEqual(['10', '_', '_']);
  });

  it('accepts exact input tape counts and empty input segments', () => {
    const machine = expectValidMachine(`tapes: 3
blank: _
alphabet: {0, 1, _}
input: "" | "_" | "10"
start: q0

state q0:
  on _/_/1 -> move S/S/R; goto q0;
`);

    expect(machine.input).toEqual(['', '_', '10']);
  });

  it('keeps the current state when goto is omitted', () => {
    const machine = expectValidMachine(`tapes: 1
blank: _
alphabet: {0, _}
input: "0"
start: q0

state q0:
  on 0 -> write _; move R;
`);

    expect(machine.transitions[0]).toMatchObject({
      from: 'q0',
      to: 'q0',
      read: [['0']],
      write: ['_'],
      move: ['R'],
    });
  });

  it('uses same writes when the write action is omitted', () => {
    const machine = expectValidMachine(`tapes: 2
blank: _
alphabet: {0, _}
input: "0"
start: q0

state q0:
  on 0/_ -> move R/S; goto q0;
`);

    expect(machine.transitions[0].write).toEqual(['same', 'same']);
  });

  it('normalizes compact read patterns', () => {
    const machine = expectValidMachine(`tapes: 4
blank: _
alphabet: {0, 1, #, _}
input: ""
start: q0

state q0:
  on */!0/{0,1}/# -> move S/S/S/S; goto q0;
`);

    expect(machine.transitions[0].read).toEqual([
      'any',
      ['1', '#', '_'],
      ['0', '1'],
      ['#'],
    ]);
  });

  it('normalizes readable if conditions and treats unmentioned tapes as any', () => {
    const machine = expectValidMachine(`tapes: 4
blank: _
alphabet: {0, 1, #, _}
input: ""
start: q0

state q0:
  if t1 != 0 and t2 in {0,1} and any t4 then move R/S/L/S; goto q1;

state q1:
`);

    expect(machine.transitions[0].read).toEqual([
      ['1', '#', '_'],
      ['0', '1'],
      'any',
      'any',
    ]);
  });

  it('expands on choose blocks into nondeterministic transitions', () => {
    const machine = expectValidMachine(`tapes: 1
blank: _
alphabet: {0, 1, _}
input: ""
start: generate

state generate:
  on _ -> choose {
    write 0; move S; goto done;
    write 1; move S; goto done;
  }

state done:
`);

    expect(machine.transitions).toHaveLength(2);
    expect(machine.transitions.map((transition) => transition.write)).toEqual([
      ['0'],
      ['1'],
    ]);
  });

  it('expands compact condition alternatives into shared-action transitions', () => {
    const machine = expectValidMachine(`tapes: 3
blank: _
alphabet: {0, 1, _}
input: ""
start: q0

state q0:
  on [1/1/*, 0/0/0] -> move R/R/S; goto done;

state done:
`);

    expect(machine.transitions).toHaveLength(2);
    expect(machine.transitions.map((transition) => transition.read)).toEqual([
      [['1'], ['1'], 'any'],
      [['0'], ['0'], ['0']],
    ]);
    expect(machine.transitions.every((transition) => transition.to === 'done')).toBe(true);
    expect(machine.transitions.every((transition) => transition.move.join('/') === 'R/R/S')).toBe(true);
  });

  it('expands readable or alternatives into shared-action transitions', () => {
    const machine = expectValidMachine(`tapes: 3
blank: _
alphabet: {0, 1, _}
input: ""
start: q0

state q0:
  if (t1 = 1 and t2 = 1) or (t1 = 0 and t2 = 0) then move R/R/S; goto done;

state done:
`);

    expect(machine.transitions).toHaveLength(2);
    expect(machine.transitions.map((transition) => transition.read)).toEqual([
      [['1'], ['1'], 'any'],
      [['0'], ['0'], 'any'],
    ]);
    expect(machine.transitions.every((transition) => transition.to === 'done')).toBe(true);
  });

  it('combines condition alternatives with choose branches', () => {
    const machine = expectValidMachine(`tapes: 1
blank: _
alphabet: {0, 1, _}
input: ""
start: generate

state generate:
  on [0, 1] -> choose {
    write 0; move R;
    write 1; move R;
  }
`);

    expect(machine.transitions).toHaveLength(4);
    expect(machine.transitions.map((transition) => ({
      read: transition.read,
      write: transition.write,
    }))).toEqual([
      { read: [['0']], write: ['0'] },
      { read: [['1']], write: ['0'] },
      { read: [['0']], write: ['1'] },
      { read: [['1']], write: ['1'] },
    ]);
  });

  it('keeps repeated matching rules as nondeterministic alternatives', () => {
    const machine = expectValidMachine(`tapes: 1
blank: _
alphabet: {0, 1, _}
input: ""
start: generate

state generate:
  on _ -> write 0; move S; goto done;
  on _ -> write 1; move S; goto done;

state done:
`);

    expect(machine.transitions).toHaveLength(2);
  });

  it('allows quoted single-character symbols including spaces', () => {
    const machine = expectValidMachine(`tapes: 1
blank: _
alphabet: {" ", _}
input: ""
start: q0

state q0:
  on " " -> write same; move S; goto q0;
`);

    expect(machine.alphabet).toEqual([' ', '_']);
    expect(machine.transitions[0]).toMatchObject({
      read: [[' ']],
      write: ['same'],
    });
  });

  it('allows numeric symbols and underscore-prefixed state names', () => {
    const machine = expectValidMachine(`tapes: 1
blank: _
alphabet: {0, 1, 2, _}
input: "12"
start: _start

state _start:
  on 1 -> write 2; move R; goto _start;
`);

    expect(machine.start).toBe('_start');
    expect(machine.transitions[0].write).toEqual(['2']);
  });

  it('allows programs without an alphabet when no complement pattern is used', () => {
    const machine = expectValidMachine(`tapes: 2
blank: _
input: "ab"
start: q0

state q0:
  on a/{b,c} -> write x/same; move R/S; goto q0;
  if t1 = _ and any t2 then move S/S; goto done;

state done:
`);

    expect(machine.alphabet).toEqual([]);
    expect(machine.input).toEqual(['ab', '_']);
    expect(machine.transitions[0]).toMatchObject({
      read: [['a'], ['b', 'c']],
      write: ['x', 'same'],
    });
  });

  it('accepts the lower and upper supported tape-count boundaries', () => {
    const singleTape = expectValidMachine(`tapes: 1
blank: _
alphabet: {0, _}
input: ""
start: q0

state q0:
  on _ -> move S;
`);

    const sixTapes = expectValidMachine(`tapes: 6
blank: _
alphabet: {0, _}
input: ""
start: q0

state q0:
  on _/_/_/_/_/_ -> move S/S/S/S/S/S;
`);

    expect(singleTape.tapes).toBe(1);
    expect(sixTapes.tapes).toBe(6);
  });

  it('allows action clauses in any order', () => {
    const machine = expectValidMachine(`tapes: 2
blank: _
alphabet: {0, 1, _}
input: ""
start: q0

state q0:
  on _/_ -> goto done; write 0/1; move R/S;

state done:
`);

    expect(machine.transitions[0]).toMatchObject({
      to: 'done',
      write: ['0', '1'],
      move: ['R', 'S'],
    });
  });

  it('normalizes readable not-in conditions', () => {
    const machine = expectValidMachine(`tapes: 2
blank: _
alphabet: {0, 1, #, _}
input: ""
start: q0

state q0:
  if t1 not in {0,#} and t2 = _ then move R/S; goto q0;
`);

    expect(machine.transitions[0].read).toEqual([['1', '_'], ['_']]);
  });

  it('supports quoted reserved one-character symbols', () => {
    const machine = expectValidMachine(`tapes: 1
blank: "_"
alphabet: {"L", "_"}
input: "L"
start: q0

state q0:
  on "L" -> write "_"; move S; goto q0;
`);

    expect(machine.alphabet).toEqual(['L', '_']);
    expect(machine.transitions[0]).toMatchObject({
      read: [['L']],
      write: ['_'],
    });
  });

  it('supports escaped quotes inside input strings', () => {
    const machine = expectValidMachine(`tapes: 1
blank: _
alphabet: {_, "\\""}
input: "\\""
start: q0

state q0:
  on "\\"" -> move S;
`);

    expect(machine.alphabet).toEqual(['_', '"']);
    expect(machine.input).toEqual(['"']);
    expect(machine.transitions[0].read).toEqual([['"']]);
  });

  it('allows star as a concrete write symbol', () => {
    const machine = expectValidMachine(`tapes: 1
blank: _
alphabet: {_, *}
input: ""
start: q0

state q0:
  on _ -> write *; move S;
`);

    expect(machine.transitions[0].write).toEqual(['*']);
  });

  it('handles block comments between header tokens', () => {
    const machine = expectValidMachine(`tapes: /* inline block comment */ 1
blank: _
alphabet: {0, _}
input: ""
start: q0

state q0:
  on _ -> move S;
`);

    expect(machine.tapes).toBe(1);
  });

  it('does not treat slash-star inside read patterns as block comments', () => {
    const machine = expectValidMachine(`tapes: 2
blank: _
alphabet: {1, _}
input: ""
start: q0

state q0:
  on 1/* -> move R/S;
`);

    expect(machine.transitions[0].read).toEqual([['1'], 'any']);
  });

  it('accepts tabs and carriage returns as insignificant whitespace', () => {
    const machine = expectValidMachine('tapes:\t1\r\nblank:\t_\r\nalphabet: {0, _}\r\ninput: ""\r\nstart: q0\r\n\r\nstate q0:\r\n\ton _ -> move S;\r\n');

    expect(machine.transitions[0].move).toEqual(['S']);
  });

  it('parses a final rule without a trailing newline', () => {
    const machine = expectValidMachine(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> write 0; move S;`);

    expect(machine.transitions).toHaveLength(1);
    expect(machine.transitions[0].write).toEqual(['0']);
  });

  it('normalizes choose branches without explicit gotos to the current state', () => {
    const machine = expectValidMachine(`tapes: 1
blank: _
alphabet: {0, 1, _}
input: ""
start: q0

state q0:
  if t1 in {0,1} then choose {
    write 0; move R;
    write 1; move R;
  }
`);

    expect(machine.transitions).toHaveLength(2);
    expect(machine.transitions.map((transition) => transition.to)).toEqual(['q0', 'q0']);
  });

  it('keeps machine output undefined only when diagnostics exist', () => {
    const result = expectValidMachine(`tapes: 1
blank: _
input: ""
start: q0

state q0:
  on a -> write b; move R;
`);

    expect(result.alphabet).toEqual([]);
    expect(result.transitions[0].read).toEqual([['a']]);
  });
});
