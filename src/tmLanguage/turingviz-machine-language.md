# TuringViz Machine Language Specification

This document specifies the TuringViz machine language supported by this
project. The language describes a nondeterministic multi-tape Turing machine as
a small line-oriented DSL.

## 1. Overview

A program consists of:

1. Header declarations.
2. One or more state blocks.
3. Transition rules inside state blocks.

Example:

```txt
tapes: 4
blank: _
alphabet: {0, 1, #, _}
input: "1010" | "" | "" | ""
start: q0

state q0:
  on 1/0/1/0 -> write same/same/0/_; move R/S/L/R; goto q1;
  if t1 = _ and t2 != 1 then move S/S/S/S; goto accept;

state q1:
  on */*/1/0 -> move S/R/S/L; goto q0;

state accept:
```

## 2. Source Text

### 2.1 Whitespace

Spaces, tabs, and carriage returns are ignored outside string literals.
Newlines are significant because each header and transition is line-oriented.

Indentation inside state blocks is recommended but has no semantic meaning.

### 2.2 Comments

Line comments start with `--` and continue to the end of the line.

```txt
-- This is a line comment.
```

Block comments start with `/*` and end with `*/`.

```txt
/* This comment may span
   multiple lines. */
```

Because `/` is also the tape-pattern separator, `/*` starts a block comment only
at the start of a file or after whitespace. Therefore this transition remains a
read pattern and is not a comment:

```txt
on 1/* -> move R/S;
```

## 3. Lexical Elements

### 3.1 Identifiers

Identifiers are used for state names and tape references.

State names must match:

```txt
[A-Za-z_][A-Za-z0-9_]*
```

Valid state names:

```txt
q0
accept
reject
copy_first
_moveLeft
```

Invalid state names:

```txt
1start
copy-first
go/right
```

Tape references have the form `tN`, where `N` is a positive integer starting at
1:

```txt
t1
t2
t6
```

### 3.2 Symbols

Symbols are values that may be read from or written to tapes.

Every concrete tape symbol must be exactly one character. Multi-character words
such as `zero` are state names or keywords, not tape symbols. Quote whitespace
when it is used as a symbol:

```txt
alphabet: {0, " ", _}
on " " -> write same; move S;
```

Unquoted symbols may be:

- single-letter words such as `a` or `_`
- single digits such as `0` or `1`
- `#`
- `*` in write/alphabet contexts

Reserved words cannot be used as unquoted symbols. Quoted reserved words are
still valid only when they contain exactly one character.

```txt
alphabet: {0, "L", _}
on "L" -> write "L"; move S;
```

String literals are delimited with double quotes. Escaped characters are allowed
inside string literals so an escaped quote does not terminate the string.

The write value `same` is a special action value and remains allowed even though
it has more than one character.

### 3.3 Reserved Words

The following words are reserved:

```txt
tapes
blank
alphabet
input
start
state
on
if
then
and
or
not
in
any
write
move
goto
same
choose
L
R
S
```

## 4. Program Structure

Header declarations and state blocks are top-level constructs.
Header declarations use the form `keyword: value`.

```txt
tapes: 2
blank: _
input: "01"
start: q0

state q0:
  on 0/_ -> move R/S; goto q0;
```

The implementation accepts header declarations and state blocks in source order.
Semantic validation checks whether referenced states and required headers exist.

## 5. Headers

### 5.1 `tapes`

Declares the number of tapes.

```txt
tapes: 3
```

Valid values are integers from `1` through `6`.

The value controls the required arity of:

- compact read patterns
- write patterns
- move patterns
- input segments, with the exception that missing input segments are allowed

### 5.2 `blank`

Declares the blank symbol.

```txt
blank: _
```

The `blank` header is required.

If an `alphabet` header is present, the blank symbol must be included in it.

### 5.3 `alphabet`

Declares the set of symbols known to the machine.

```txt
alphabet: {0, 1, #, _}
```

The `alphabet` header is optional unless the program uses a complement matcher:

- `!=`
- `!x`
- `not in {...}`

If present, the alphabet is used to validate:

- the blank symbol
- input symbols
- read symbols
- write symbols
- set elements

If omitted, symbol membership is not validated and the normalized machine uses an
empty alphabet array.

Alphabet symbols must be unique.

Alphabet symbols must each be exactly one character.

### 5.4 `input`

Declares initial tape contents.

```txt
input: "1010" | "" | "_"
```

Input segments are separated by `|`.

The number of segments must be less than or equal to `tapes`. If fewer segments
are declared, omitted tapes are initialized with the blank symbol.

Example:

```txt
tapes: 3
blank: _
input: "10"
```

Normalizes to:

```txt
["10", "_", "_"]
```

If an alphabet is present, every character in each input string must be part of
the alphabet.

The empty string `""` means the tape starts empty. It is preserved as an empty
input segment; it is not rewritten to the blank symbol.

### 5.5 `start`

Declares the start state.

```txt
start: q0
```

The referenced state must be declared by a `state` block.

## 6. State Blocks

State blocks group transitions by source state.

```txt
state scan:
  on 0 -> move R;
  on _ -> move S; goto accept;
```

A state block starts with:

```txt
state <name>:
```

The block continues until the next `state` declaration or the end of the file.

Duplicate state names are invalid.

## 7. Terminal States

A state with no transitions is terminal. Execution cannot continue from that
state because no outgoing transition can match.

```txt
state accept:
```

## 8. Transitions

Every transition has:

- a source state, determined by the surrounding state block
- a read condition
- actions

Every transition must contain a `move` action.

If `write` is omitted, all tapes use `same`.

If `goto` is omitted, the transition stays in the current state.

Multiple transitions in the same state may match the same configuration. This is
nondeterminism.

## 9. Compact Transitions with `on`

The compact form is:

```txt
on <read-pattern> -> <actions>
```

Example:

```txt
on 1/0/1/0 -> write same/same/0/_; move R/S/L/R; goto q1;
```

The read pattern must contain exactly one matcher per tape, separated by `/`.

For four tapes:

```txt
on 1/0/1/0
```

means:

```txt
t1 = 1
t2 = 0
t3 = 1
t4 = 0
```

### 9.1 Read Pattern Elements

Allowed compact read-pattern elements:

```txt
0       concrete symbol
_       concrete blank symbol, if blank is _
*       any symbol
!0      any symbol except 0; requires alphabet
{0,1}   any listed symbol
```

Examples:

```txt
on 1/0/1/0 -> move R/S/L/R;
on 1/*/1/0 -> move R/S/L/R;
on 1/!2/1/0 -> move R/S/L/R;
on {0,1}/_/*/# -> move R/S/S/L;
```

`!x` requires an `alphabet` header because it expands to every alphabet symbol
except `x`.

### 9.2 Compact Condition Alternatives

Multiple complete read patterns can share the same actions by wrapping them in
`[...]` and separating alternatives with commas.

```txt
on [1/1/*, 0/0/0] -> move R/R/S;
```

This is equivalent to:

```txt
on 1/1/* -> move R/R/S;
on 0/0/0 -> move R/R/S;
```

Each alternative is a full read pattern and must contain exactly one matcher per
tape. The list does not form a cross product.

## 10. Readable Transitions with `if`

The readable form is:

```txt
if <condition> then <actions>
```

Examples:

```txt
if t1 = 1 and t2 != 2 then write 0/same; move R/S; goto q1;
if t1 in {0,1} and t2 = _ then move R/S; goto scan;
if t1 = _ and t2 not in {0,#} then move S/L;
```

Conditions are conjunctions of condition atoms joined with `and`. Alternatives
can be joined with `or`; each alternative shares the same actions.

```txt
if (t1 = 1 and t2 = 1) or (t1 = 0 and t2 = 0) then move R/R/S;
```

This is equivalent to:

```txt
if t1 = 1 and t2 = 1 then move R/R/S;
if t1 = 0 and t2 = 0 then move R/R/S;
```

Parentheses are recommended around `or` alternatives. `and` binds inside one
alternative; `or` creates another transition alternative.

### 10.1 Condition Atoms

Allowed condition atoms:

```txt
t1 = 0
t1 != 0
t1 in {0,1,#}
t1 not in {_,#}
any t1
```

`!=` and `not in` require an `alphabet` header.

Unmentioned tapes are treated as `any`.

For three tapes:

```txt
if t1 = 1 then move R/S/S;
```

is equivalent to:

```txt
if t1 = 1 and any t2 and any t3 then move R/S/S;
```

## 11. Actions

Actions appear after `->` in compact transitions or after `then` in readable
transitions.

```txt
write <write-pattern>;
move <move-pattern>;
goto <state>;
```

Action order is flexible, but each action may appear at most once in a
transition.

Each action statement must end with `;`.

### 11.1 `write`

Writes one value per tape.

```txt
write 0/1/same/_;
```

`write` is optional. If omitted, every tape keeps its current symbol.

Allowed write values:

```txt
0       write symbol 0
_       write the blank symbol, if blank is _
same    keep the current symbol unchanged
```

The write pattern must contain exactly one value per tape.

### 11.2 `move`

Moves one head per tape.

```txt
move R/S/L/R;
```

`move` is required.

Allowed directions:

```txt
L   move left
R   move right
S   stay
```

The move pattern must contain exactly one direction per tape.

### 11.3 `goto`

Changes the current state.

```txt
goto q1;
```

`goto` is optional. If omitted, the transition remains in the current state.

The target state must be declared.

## 12. Nondeterminism

If multiple transitions in the same state match the same configuration, they are
nondeterministic alternatives.

```txt
state generate:
  on 0 -> write 0; move R;
  on 0 -> write 1; move R;
  on _ -> move S; goto done;
```

## 13. `choose` Blocks

`choose` groups nondeterministic alternatives that share the same condition.

Compact form:

```txt
state generate:
  on 0 -> choose {
    write 0; move R;
    write 1; move R;
  }
```

Readable form:

```txt
state generate:
  if t1 = _ then choose {
    write 0; move S; goto done;
    write 1; move S; goto done;
  }
```

`choose` is syntactic sugar. Each action line inside the block becomes a separate
transition with the same read condition.

## 14. Normalization Semantics

The parser and validator produce a normalized machine representation when the
program has no errors.

Each normalized transition has:

```txt
from:  source state
to:    target state, or source state if goto is omitted
read:  one matcher per tape
write: one write value per tape
move:  one move direction per tape
```

Example source:

```txt
state q0:
  on 1/0 -> write same/1; move R/S; goto q1;
```

Normalized transition:

```txt
from: q0
to: q1
read: [[1], [0]]
write: [same, 1]
move: [R, S]
```

If `write` is omitted:

```txt
on 1/* -> move R/S;
```

normalizes to:

```txt
from: q0
to: q0
read: [[1], any]
write: [same, same]
move: [R, S]
```

If an alphabet is present:

```txt
alphabet: {0, 1, _, #}
on 1/!0 -> move R/S;
```

normalizes the second read matcher to:

```txt
[1, _, #]
```

## 15. Validation Rules

A program is invalid if any of the following applies:

- `tapes` is missing.
- `tapes` is not between `1` and `6`.
- `blank` is missing.
- `input` is missing.
- `start` is missing.
- `alphabet` contains duplicate symbols.
- `alphabet` contains a symbol that is not exactly one character.
- `blank` is not exactly one character.
- `blank` is not in `alphabet`, when `alphabet` is declared.
- an input symbol is not in `alphabet`, when `alphabet` is declared.
- `input` declares more segments than `tapes`.
- the start state is not declared.
- a `goto` target state is not declared.
- a state is declared more than once.
- a compact `on` read pattern does not contain exactly one matcher per tape.
- a `write` pattern does not contain exactly one value per tape.
- a `move` pattern does not contain exactly one direction per tape.
- a transition does not contain `move`.
- a tape reference such as `t3` is outside the configured tape range.
- a read or write symbol is not in `alphabet`, when `alphabet` is declared.
- a read or write symbol is not exactly one character. The write value `same`
  is exempt because it means "keep the current symbol unchanged".
- `!=`, `!x`, or `not in` is used without an `alphabet` header.
- a reserved word is used as an unquoted symbol.
- a reserved word is used as a state name.
- a state name has invalid syntax.
- an action statement is missing its trailing semicolon.
- a `choose` block is missing `{` or `}`.
- a string literal is not closed.
- a block comment is not closed.
- an unknown character appears in the source.

## 16. Error Reporting

The implementation reports diagnostics with:

- a stable diagnostic code
- a human-readable message
- a source range
- a severity

The Monaco editor maps these diagnostics to editor markers. The marker message
is the same human-readable message produced by the parser or validator.

Example diagnostics:

```txt
Every transition must contain a move action.
Target state `missing` is not declared.
Read pattern has 1 item(s), but `tapes` is 2.
Symbol `2` is not part of the alphabet.
Complement patterns require an `alphabet` header.
```

## 17. Hover Information

The editor provides hover information for:

- language keywords
- declared state names
- `goto` target states
- tape references such as `t1`
- quoted strings
- symbols from a declared alphabet

Hover information is derived from the same parser and AST used for validation.

## 18. File Extension and Monaco Language ID

The Monaco language id is:

```txt
turingviz-machine
```

The registered file extension is:

```txt
.tvm
```
