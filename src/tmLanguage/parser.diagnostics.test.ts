import { expectDiagnosticCodes } from './testUtils';

describe('parseTuringMachine diagnostics', () => {
  it('reports unknown characters', () => {
    expectDiagnosticCodes('@', ['LEX_UNKNOWN_CHARACTER']);
  });

  it('reports strings that reach a line break', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {0, _}
input: "0
start: q0
`, ['LEX_UNTERMINATED_STRING']);
  });

  it('reports strings that reach the end of file', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {0, _}
input: "0`, ['LEX_UNTERMINATED_STRING']);
  });

  it('reports unterminated block comments', () => {
    expectDiagnosticCodes(`tapes: 1
/* open comment`, ['LEX_UNTERMINATED_BLOCK_COMMENT']);
  });

  it('reports unexpected top-level content', () => {
    expectDiagnosticCodes('move R;', ['PARSE_EXPECTED_TOP_LEVEL']);
  });

  it('reports missing header colons', () => {
    expectDiagnosticCodes(`tapes 1
blank: _
input: ""
start: q0

state q0:
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('reports duplicate headers', () => {
    expectDiagnosticCodes(`tapes: 1
tapes: 2
blank: _
alphabet: {0, _}
input: ""
start: q0

state q0:
`, ['PARSE_DUPLICATE_HEADER']);
  });

  it('reports trailing header tokens', () => {
    expectDiagnosticCodes(`tapes: 1 extra
blank: _
alphabet: {0, _}
input: ""
start: q0

state q0:
`, ['PARSE_TRAILING_HEADER_TOKENS']);
  });

  it('reports missing required headers', () => {
    expectDiagnosticCodes(`state q0:
`, [
      'VALIDATION_MISSING_HEADER',
    ]);
  });

  it('reports tape counts outside the supported range', () => {
    expectDiagnosticCodes(`tapes: 7
blank: _
alphabet: {0, _}
input: ""
start: q0

state q0:
`, ['VALIDATION_TAPES_RANGE']);
  });

  it('reports zero tape counts', () => {
    expectDiagnosticCodes(`tapes: 0
blank: _
alphabet: {0, _}
input: ""
start: q0

state q0:
`, ['VALIDATION_TAPES_RANGE']);
  });

  it('reports missing tape count values', () => {
    expectDiagnosticCodes(`tapes:
blank: _
input: ""
start: q0

state q0:
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('reports missing blank symbols', () => {
    expectDiagnosticCodes(`tapes: 1
blank:
input: ""
start: q0

state q0:
`, ['PARSE_EXPECTED_SYMBOL']);
  });

  it('reports missing input strings', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
input:
start: q0

state q0:
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('reports missing start names', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
input: ""
start:

state q0:
`, ['PARSE_EXPECTED_STATE_NAME']);
  });

  it('reports missing state colons', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
input: ""
start: q0

state q0
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('reports blank symbols outside the alphabet', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {0, 1}
input: "0"
start: q0

state q0:
`, ['VALIDATION_BLANK_NOT_IN_ALPHABET']);
  });

  it('reports empty alphabets when a blank symbol is declared', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {}
input: ""
start: q0

state q0:
`, ['VALIDATION_BLANK_NOT_IN_ALPHABET']);
  });

  it('reports duplicate alphabet symbols', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {0, 0, _}
input: "0"
start: q0

state q0:
`, ['VALIDATION_DUPLICATE_ALPHABET_SYMBOL']);
  });

  it('reports multi-character blank symbols', () => {
    expectDiagnosticCodes(`tapes: 1
blank: empty
alphabet: {e, _}
input: ""
start: q0

state q0:
`, ['VALIDATION_SYMBOL_LENGTH']);
  });

  it('reports multi-character alphabet symbols', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {zero, _}
input: ""
start: q0

state q0:
`, ['VALIDATION_SYMBOL_LENGTH']);
  });

  it('reports too many input segments', () => {
    expectDiagnosticCodes(`tapes: 2
blank: _
alphabet: {0, 1, _}
input: "10" | "" | ""
start: q0

state q0:
`, ['VALIDATION_INPUT_TAPE_COUNT']);
  });

  it('reports input symbols outside the alphabet', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {0, _}
input: "1"
start: q0

state q0:
`, ['VALIDATION_INPUT_SYMBOL']);
  });

  it('reports unknown start states', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {0, _}
input: ""
start: missing

state q0:
`, ['VALIDATION_UNKNOWN_START_STATE']);
  });

  it('reports duplicate states', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {0, _}
input: ""
start: q0

state q0:

state q0:
`, ['VALIDATION_DUPLICATE_STATE']);
  });

  it('reports unknown rules inside a state', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  write 0; move S;
`, ['PARSE_EXPECTED_RULE']);
  });

  it('reports missing arrows in compact transitions', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ move S;
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('reports missing then in readable transitions', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  if t1 = _ move S;
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('reports invalid condition starts', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  if _ = t1 then move S;
`, ['PARSE_EXPECTED_TAPE_REFERENCE']);
  });

  it('reports invalid condition operators', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  if t1 _ then move S;
`, ['PARSE_EXPECTED_CONDITION_OPERATOR']);
  });

  it('reports unclosed symbol sets', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  if t1 in {_,0 then move S;
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('reports unclosed alphabet declarations', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0
input: ""
start: q0

state q0:
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('recovers from malformed alphabet items and continues parsing', () => {
    const diagnostics = expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {0, @, _}
input: ""
start: q0

state q0:
  on _ -> move S;
`, ['LEX_UNKNOWN_CHARACTER', 'PARSE_EXPECTED_SYMBOL']);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('PARSE_EXPECTED_SYMBOL');
  });

  it('reports choose blocks without an opening brace', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> choose
    move S;
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('reports choose blocks without a closing brace', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> choose {
    move S;
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('reports trailing tokens after choose blocks', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> choose {
    move S;
  } extra
`, ['PARSE_TRAILING_RULE_TOKENS']);
  });

  it('reports empty action tails', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ ->
`, ['PARSE_EXPECTED_ACTION']);
  });

  it('reports compact condition alternatives without a closing bracket', () => {
    expectDiagnosticCodes(`tapes: 2
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on [0/_, _/_ -> move S/S;
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('reports empty compact condition alternative lists', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on [] -> move S;
`, ['PARSE_EXPECTED_READ_PATTERN']);
  });

  it('reports read-pattern arity mismatches inside compact condition alternatives', () => {
    expectDiagnosticCodes(`tapes: 2
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on [_, _/_] -> move S/S;
`, ['VALIDATION_READ_PATTERN_ARITY']);
  });

  it('reports readable or alternatives without a closing parenthesis', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  if (t1 = _ or (t1 = 0) then move S;
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('reports empty readable condition alternatives', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  if () then move S;
`, ['PARSE_EXPECTED_CONDITION']);
  });

  it('reports missing action semicolons', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> move S
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('reports missing write action semicolons before later actions', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> write 0 move S;
`, ['PARSE_UNEXPECTED_TOKEN']);
  });

  it('reports unknown action statements', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> erase _; move S;
`, ['PARSE_EXPECTED_ACTION']);
  });

  it('reports duplicate write actions', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> write 0; write _; move S;
`, ['PARSE_DUPLICATE_WRITE']);
  });

  it('reports duplicate move actions', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> move S; move R;
`, ['PARSE_DUPLICATE_MOVE']);
  });

  it('reports duplicate goto actions', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> move S; goto q0; goto q0;
`, ['PARSE_DUPLICATE_GOTO']);
  });

  it('reports duplicate actions inside choose branches', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> choose {
    write 0; write _; move S;
  }
`, ['PARSE_DUPLICATE_WRITE']);
  });

  it('reports invalid move directions', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> move X;
`, ['PARSE_INVALID_DIRECTION']);
  });

  it('continues validating move arity after invalid directions', () => {
    expectDiagnosticCodes(`tapes: 2
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _/_ -> move X;
`, ['PARSE_INVALID_DIRECTION', 'VALIDATION_MOVE_PATTERN_ARITY']);
  });

  it('reports unquoted reserved symbols', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {same, _}
input: ""
start: q0

state q0:
  on _ -> move S;
`, ['PARSE_RESERVED_SYMBOL']);
  });

  it('reports quoted reserved words that are still too long as symbols', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {"same", _}
input: ""
start: q0

state q0:
  on _ -> move S;
`, ['VALIDATION_SYMBOL_LENGTH']);
  });

  it('reports reserved state names', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: state

state state:
`, ['PARSE_RESERVED_STATE_NAME']);
  });

  it('reports reserved goto target names during parsing', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> move S; goto move;
`, ['PARSE_RESERVED_STATE_NAME']);
  });

  it('reports invalid state names', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state 1:
`, ['PARSE_EXPECTED_STATE_NAME']);
  });

  it('reports read pattern arity mismatches', () => {
    expectDiagnosticCodes(`tapes: 2
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> move S/S;
`, ['VALIDATION_READ_PATTERN_ARITY']);
  });

  it('reports write pattern arity mismatches', () => {
    expectDiagnosticCodes(`tapes: 2
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _/_ -> write 0; move S/S;
`, ['VALIDATION_WRITE_PATTERN_ARITY']);
  });

  it('reports move pattern arity mismatches', () => {
    expectDiagnosticCodes(`tapes: 2
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _/_ -> move S;
`, ['VALIDATION_MOVE_PATTERN_ARITY']);
  });

  it('reports a shared action diagnostic once for condition alternatives', () => {
    const diagnostics = expectDiagnosticCodes(`tapes: 2
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on [_/_, 0/_] -> move S;
`, ['VALIDATION_MOVE_PATTERN_ARITY']);

    expect(
      diagnostics.filter(
        (diagnostic) => diagnostic.code === 'VALIDATION_MOVE_PATTERN_ARITY',
      ),
    ).toHaveLength(1);
  });

  it('reports a shared condition diagnostic once for choose branches', () => {
    const diagnostics = expectDiagnosticCodes(`tapes: 2
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> choose {
    move S/S;
    write 0/_; move S/S;
  }
`, ['VALIDATION_READ_PATTERN_ARITY']);

    expect(
      diagnostics.filter(
        (diagnostic) => diagnostic.code === 'VALIDATION_READ_PATTERN_ARITY',
      ),
    ).toHaveLength(1);
  });

  it('reports missing move actions', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> write 0;
`, ['VALIDATION_MISSING_MOVE']);
  });

  it('reports unknown goto targets', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> move S; goto missing;
`, ['VALIDATION_UNKNOWN_GOTO']);
  });

  it('reports tape references outside the configured range', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  if t2 = _ then move S;
`, ['VALIDATION_TAPE_REFERENCE_RANGE']);
  });

  it('reports tape reference zero as an invalid condition start', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  if t0 = _ then move S;
`, ['PARSE_EXPECTED_TAPE_REFERENCE']);
  });

  it('reports complement patterns when alphabet is missing', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
input: ""
start: q0

state q0:
  on !0 -> move S;
`, ['VALIDATION_COMPLEMENT_REQUIRES_ALPHABET']);
  });

  it('reports readable complement patterns when alphabet is missing', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
input: ""
start: q0

state q0:
  if t1 != _ then move S;
`, ['VALIDATION_COMPLEMENT_REQUIRES_ALPHABET']);
  });

  it('reports not-in complement patterns when alphabet is missing', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
input: ""
start: q0

state q0:
  if t1 not in {_} then move S;
`, ['VALIDATION_COMPLEMENT_REQUIRES_ALPHABET']);
  });

  it('reports symbols outside the alphabet in transitions', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on 1 -> write 1; move S;
`, ['VALIDATION_SYMBOL_NOT_IN_ALPHABET']);
  });

  it('reports multi-character transition symbols', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
input: ""
start: q0

state q0:
  on word -> write other; move S;
`, ['VALIDATION_SYMBOL_LENGTH']);
  });

  it('reports multi-character quoted transition symbols', () => {
    expectDiagnosticCodes(`tapes: 1
blank: _
input: ""
start: q0

state q0:
  on "ab" -> write "cd"; move S;
`, ['VALIDATION_SYMBOL_LENGTH']);
  });

  it('does not expose a machine when syntax diagnostics exist', () => {
    const diagnostics = expectDiagnosticCodes(`tapes: 1
blank: _
alphabet: {_, 0}
input: ""
start: q0

state q0:
  on _ -> move S; unexpected
`, ['PARSE_EXPECTED_ACTION']);

    expect(diagnostics.length).toBeGreaterThan(0);
  });
});
