type ExampleTM = {
  name: string;
  code: string;
};

export const ExampleTMs: ExampleTM[] = [];

export const CheckEven: ExampleTM = {
  name: 'CheckEven',
  code: `/*
 * Checks if the number of 1's in the input
 * (consisting of 0's and 1's) is even.
 */
tapes: 1
blank: " "
input: "101100001100000111000000000011111"
start: even

state even:
  on 0 -> move R;
  on 1 -> move R; goto odd;
  on " " -> move S; goto accept;

state odd:
  on 0 -> move R;
  on 1 -> move R; goto even;
  on " " -> move S; goto reject;

state accept:

state reject:`,
};

export const GCD: ExampleTM = {
  name: 'GCD',
  code: `/*
 * Computes the GCD of two numbers in unary.
 * Example input: 6 and 4 in unary.
 */
tapes: 4
blank: " "
input: "000000#0000" | "" | "" | ""
start: copy_first

state copy_first:
  on 0/" "/" "/" " -> write same/0/same/same; move R/R/S/S;
  on #/" "/" "/" " -> move R/S/S/S; goto copy_second;

state copy_second:
  on 0/" "/" "/" " -> write same/same/0/same; move R/S/R/S;
  on " "/" "/" "/" " -> move L/L/L/S; goto move_to_begin;

state move_to_begin:
  on [0/0/0/" ", #/0/0/" "] -> move L/L/L/S;
  on [0/0/" "/" ", #/0/" "/" "] -> move L/L/S/S;
  on [0/" "/" "/" ", #/" "/" "/" "] -> move L/S/S/S;
  on [0/" "/0/" ", #/" "/0/" "] -> move L/S/L/S;
  on " "/0/" "/" " -> move S/L/S/S;
  on " "/" "/0/" " -> move S/S/L/S;
  on " "/" "/" "/" " -> move R/R/R/S; goto euclid;

state euclid:
  on */0/0/" " -> move S/R/R/S;
  on */" "/0/" " -> move S/L/R/S; goto firstsmaller_goright;
  on */0/" "/" " -> move S/R/L/S; goto secondsmaller_goright;
  on */" "/" "/" " -> move S/L/L/S; goto copy_result;

state firstsmaller_goright:
  on */0/0/" " -> move S/S/R/S;
  on */0/" "/" " -> move S/S/L/S; goto firstsmaller_substract;

state secondsmaller_goright:
  on */0/0/" " -> move S/R/S/S;
  on */" "/0/" " -> move S/L/S/S; goto secondsmaller_substract;

state firstsmaller_substract:
  on */0/0/" " -> write same/0/" "/" "; move S/L/L/S;
  on */" "/0/" " -> move S/S/S/S; goto move_to_begin;

state secondsmaller_substract:
  on */0/0/" " -> write same/" "/0/" "; move S/L/L/S;
  on */0/" "/" " -> move S/S/S/S; goto move_to_begin;

state copy_result:
  on */0/0/" " -> write same/same/same/0; move S/L/L/R;
  on */" "/" "/" " -> move S/R/R/L; goto finish_up;

state finish_up:
  on */*/*/0 -> move S/S/S/L;
  on */*/*/" " -> move S/S/S/R; goto accept;

state accept:`,
};

export const AllStrings: ExampleTM = {
  name: 'AllStrings',
  code: `/*
 * Generating all possible strings of given length,
 * consisting of 0's and 1's. The input length is 3.
 */
tapes: 1
blank: " "
input: "000"
start: generate

state generate:
  on 0 -> choose {
    write 0; move R;
    write 1; move R;
  }
  on " " -> move S; goto done;

state done:`,
};

export const Fib: ExampleTM = {
  name: 'Fib',
  code: `-- On input 1^n, this machine has exactly fib(n) accepting paths
tapes: 1
blank: _
input: "1111111"
start: start_state

state start_state:
  on 1 -> move R; goto fib;
  on _ -> move S; goto reject;

state fib:
  on 1 -> choose {
    move R; goto fib;
    move R; goto take2;
  }
  on _ -> move S; goto accept;

state take2:
  on 1 -> move R; goto fib;
  on _ -> move S; goto reject;

state accept:

state reject:`,
};

export const DAG: ExampleTM = {
  name: 'DAG',
  code: `/*
 * Computing a config graph that is a DAG.
 * The input length is 6.
 */
tapes: 1
blank: " "
input: "000000"
start: go

state go:
  on 0 -> choose {
    move R;
    move S; goto goright;
  }
  on " " -> move S; goto done;

state goright:
  on 0 -> move R; goto go;

state done:`,
};

export const Circle: ExampleTM = {
  name: 'Circle',
  code: `-- Creates a config graph that is a circle
tapes: 1
blank: " "
input: "0"
start: goright

state goright:
  on 0 -> move R;
  on " " -> move L; goto goleft;

state goleft:
  on 0 -> move L;
  on " " -> move R; goto goright;`,
};

export const BinaryAdd: ExampleTM = {
  name: 'BinaryAdd',
  code: `-- Binary addition on 2 tapes with output on tape 3
tapes: 3
blank: " "
input: "111010" | "1111"
start: goright

state goright:
  on [1/1/*, 1/0/*, 0/1/*, 0/0/*] -> move R/R/S;
  on [1/" "/*, 0/" "/*] -> move R/S/S;
  on [" "/1/*, " "/0/*] -> move S/R/S;
  on " "/" "/* -> move L/L/S; goto add;

state add:
  on 1/1/* -> write same/same/0; move L/L/L; goto carry;
  on [1/0/*, 0/1/*, 1/" "/*, " "/1/*] -> write same/same/1; move L/L/L; goto add;
  on [0/0/*, 0/" "/*, " "/0/*] -> write same/same/0; move L/L/L; goto add;

state carry:
  on 1/1/* -> write same/same/1; move L/L/L; goto carry;
  on [1/0/*, 0/1/*, 1/" "/*, " "/1/*] -> write same/same/0; move L/L/L; goto carry;
  on [0/0/*, 0/" "/*, " "/0/*] -> write same/same/1; move L/L/L; goto add;
  on " "/" "/* -> write same/same/1; move S/S/S; goto done;

state done:`,
};

export const NonDetSubstring: ExampleTM = {
  name: 'NonDetSubstring',
  code: `/*
 * Contains substring (nondeterministic).
 * Input: First tape is the input string, second tape is the string searched in the first.
 */
tapes: 2
blank: " "
input: "111010" | "101"
start: goright

-- Go right and compare
state goright:
  -- Guess that this is the beginning of the substring
  on [1/0, 0/1, 1/1, 0/0] -> choose {
    move R/S; goto goright;
    move S/S; goto compare;
  }
  on [" "/1, 1/" ", 0/" ", " "/0, " "/" "] -> move S/S; goto reject;

state compare:
  on [1/1, 0/0] -> move R/R;
  on [" "/" ", 1/" ", 0/" "] -> move S/S; goto accept;
  on [1/0, 0/1, " "/1, " "/0] -> move S/S; goto reject;

state accept:

state reject:`,
};

export const vvWord: ExampleTM = {
  name: 'vvWord',
  code: `/*
 * Check if string is two times the same string.
 * Input: A string w. Program checks (non-det) if w = vv for some string v.
 */
tapes: 2
blank: " "
input: "010010"
start: gobyone

state gobyone:
  on */* -> move R/S; goto goright;

state goright:
  -- Go right or choose this location as the middle
  on [0/*, 1/*] -> choose {
    move R/S;
    move S/S; goto copydown;
  }
  on " "/* -> move S/S; goto reject;

-- Copy the remaining string
state copydown:
  on 0/* -> write " "/0; move R/R;
  on 1/* -> write " "/1; move R/R;
  on " "/* -> move S/L; goto gotoendfirst;

state gotoendfirst:
  on " "/* -> move L/S;
  on [1/*, 0/*] -> move S/S; goto gotobegin;

state gotobegin:
  on [1/1, 0/0, 1/0, 0/1] -> move L/L;
  on [1/" ", 0/" "] -> move L/S;
  on [" "/1, " "/0] -> move S/L;
  on " "/" " -> move R/R; goto compare;

-- Compare if the split creates two strings that are the same
state compare:
  on [1/1, 0/0] -> move R/R;
  on " "/" " -> move S/S; goto accept;
  on [1/0, 0/1, " "/1, " "/0, 1/" ", 0/" "] -> move S/S; goto reject;

state accept:

state reject:`,
};

export const NonDetSubSetSum: ExampleTM = {
  name: 'NonDetSubSetSum',
  code: `/*
 * This Turing machine solves SubSetSum non-deterministically in linear time.
 * Input: #n1#n2#n3#n4#....# on the first tape and the desired sum n on the second tape.
 * Every number is in binary.
 */
tapes: 3
blank: " "
input: "#100#11#10#101#" | "1000"
start: choose_state

-- Decide whether to take that number into the sum or not
state choose_state:
  on #/*/* -> move R/S/S;
  on [1/*/*, 0/*/*] -> choose {
    move S/S/S; goto skip;
    move S/S/S; goto take;
  }
  on " "/*/* -> move S/S/S; goto goforcompare;

-- Skip the number
state skip:
  on [0/*/*, 1/*/*] -> move R/S/S;
  on #/*/* -> move R/S/S; goto choose_state;

/*
 * Take the number to the sum
 * For this: first go right until the end of that number
 */
state take:
  on [1/*/*, 0/*/*] -> move R/S/S;
  on #/*/* -> move L/S/S; goto add;
  on " "/*/* -> move S/S/S; goto goforcompare;

-- Add the number to the sum
state add:
  on [0/*/0, 0/*/1] -> move L/S/L;
  on [1/*/0, 1/*/" "] -> write same/same/1; move L/S/L;
  on 0/*/" " -> write same/same/0; move L/S/L;
  on 1/*/1 -> write same/same/0; move L/S/L; goto carry;
  on #/*/* -> move R/S/R; goto continue;

state carry:
  on 0/*/0 -> write same/same/1; move L/S/L; goto add;
  on [1/*/0, 0/*/1, 1/*/" "] -> write same/same/0; move L/S/L; goto carry;
  on [#/*/0, 0/*/" ", #/*/" "] -> write same/same/1; move R/S/R; goto continue;
  on #/*/1 -> write same/same/0; move S/S/L; goto carry;
  on 1/*/0 -> move L/S/L;
  on 1/*/1 -> write same/same/1; move L/S/L; goto carry;

/*
 * Go completely right on the sum on tape 3 and the number
 * we are currently looking at on tape 1.
 */
state continue:
  on [1/*/1, 0/*/0, 1/*/0, 0/*/1] -> move R/S/R;
  on [#/*/1, #/*/0] -> move S/S/R;
  on [0/*/" ", 1/*/" "] -> move R/S/S;
  on #/*/" " -> move R/S/L; goto choose_state;

/*
 * Compare if the calculated sum is the desired sum
 * Go left for being able to compare
 */
state goforcompare:
  on [*/1/1, */0/0, */1/0, */0/1] -> move S/L/L;
  on [*/" "/1, */" "/0] -> move S/S/L;
  on [*/1/" ", */0/" "] -> move S/L/S;
  on */" "/" " -> move S/R/R; goto compare;

-- Actually compare both numbers
state compare:
  on [*/1/1, */0/0] -> move S/R/R;
  on */" "/" " -> move S/S/S; goto accept;
  on [*/1/0, */1/" ", */0/1, */0/" ", */" "/1, */" "/0] -> move S/S/S; goto reject;

state accept:

state reject:`,
};

export const NonDetSAT: ExampleTM = {
  name: 'NonDetSAT',
  code: `/*
 * SAT solver: accept if CNF formula is satisfiable, reject otherwise.
 * Explanation: n = not; o = or; a = and.
 * Formula must be in CNF; every clause needs braces.
 */
tapes: 3
blank: " "
input: "(n101o10on100)a(n10o100o101)a(n11on10o111)a(n100o110on111)"
start: variables

-- Identification of variables and writing them on tape 2
state variables:
  on ["("/*/*, n/*/*, o/*/*, ")"/*/*, a/*/*] -> move R/S/S;
  on [1/*/*, 0/*/*] -> move S/S/S; goto findvar;
  -- Finished
  on [" "/0/*, " "/1/*] -> move L/L/S; goto goleftfirsttape;

-- Find the variable in the variables
state findvar:
  /*
   * Compare variables
   * Case: same char
   */
  on [1/1/*, 0/0/*] -> move R/R/S;
  /*
   * Case: different char
   * Case 1: no match
   */
  on [1/0/*, 1/#/*, 0/1/*, 0/#/*, a/0/*, o/0/*, "("/0/*, ")"/0/*, a/1/*, o/1/*, "("/1/*, ")"/1/*] -> move L/S/S; goto goleftonevarfirst_gorightonevarsecond;
  -- Case 2: match
  on [o/#/*, a/#/*, "("/#/*, ")"/#/*, n/#/*] -> move S/S/S; goto gorightonefirst_goleftsecond;
  -- Case: variable tape empty here
  on [1/" "/*, 0/" "/*] -> move S/S/S; goto writedownvariable;

-- Go left one var on first tape and right one var on second tape
state goleftonevarfirst_gorightonevarsecond:
  -- Finished
  on ["("/#/*, ")"/#/*, a/#/*, o/#/*, n/#/*] -> move S/R/S; goto variables;
  -- First tape and second tape still need to move
  on [0/1/*, 0/0/*, 1/0/*, 1/1/*] -> move L/R/S;
  -- Only first tape still needs to move
  on [0/#/*, 1/#/*] -> move L/S/S;
  -- Only second tape still needs to move
  on [a/0/*, o/0/*, "("/0/*, ")"/0/*, n/0/*, a/1/*, o/1/*, "("/1/*, ")"/1/*, n/1/*] -> move S/R/S;

-- Write down variable that hasn't been "registered" yet
state writedownvariable:
  on 1/*/* -> write same/1/same; move R/R/S;
  on 0/*/* -> write same/0/same; move R/R/S;
  on ["("/*/*, n/*/*, o/*/*, ")"/*/*] -> write same/#/same; move S/L/S; goto gorightonefirst_goleftsecond;

state gorightonefirst_goleftsecond:
  -- Finished
  on ["("/" "/*, ")"/" "/*, a/" "/*, o/" "/*, n/" "/*] -> move S/R/S; goto variables;
  -- First tape finished, second not
  on ["("/1/*, ")"/1/*, a/1/*, o/1/*, n/1/*, "("/0/*, ")"/0/*, a/0/*, o/0/*, n/0/*, "("/#/*, ")"/#/*, a/#/*, o/#/*, n/#/*] -> move S/L/S;
  -- Both tapes not finished
  on [0/1/*, 1/1/*, 0/0/*, 1/0/*, 0/#/*, 1/#/*] -> move R/L/S;

state goleftfirsttape:
  on [1/*/*, 0/*/*, o/*/*, a/*/*, n/*/*, "("/*/*, ")"/*/*] -> move L/S/S;
  on " "/" "/* -> move R/R/S; goto guessassignment;

state guessassignment:
  -- Write string of 1s and 0s on the third tape. For each variable one char
  on [*/0/*, */1/*] -> choose {
    write same/same/1; move S/R/R; goto nextvar;
    write same/same/0; move S/R/R; goto nextvar;
  }
  -- Finished
  on */" "/" " -> move S/L/L; goto goeval;

state nextvar:
  -- Skip the var on second tape
  on [*/0/*, */1/*] -> move S/R/S;
  -- Finished
  on [*/#/*] -> move S/R/S; goto guessassignment;

state goeval:
  /*
   * Go left on second and third tape until there is no more to go
   * Both tapes
   */
  on [*/0/0, */0/1, */1/0, */1/1, */#/0, */#/1] -> move S/L/L;
  -- Just second tape
  on [*/0/" ", */1/" ", */#/" "] -> move S/L/S;
  -- Just third tape
  on [*/" "/0, */" "/1] -> move S/S/L;
  -- Finished
  on [*/" "/" "] -> move S/R/R; goto eval;

/*
 * Go through clause from left to right and check for true in this clause
 * Assert: 2nd and 3rd tape are on their first char
 */
state eval:
  on ")"/*/* -> move S/S/S; goto reject;
  on ["("/*/*, a/*/*, o/*/*] -> move R/S/S;
  on " "/*/* -> move S/S/S; goto accept;
  on [0/*/*, 1/*/*] -> move S/S/S; goto evalpositive;
  on n/*/* -> move R/S/S; goto evalnegative;

/*
 * Check if assignment of variable is 1
 * Assert: 2nd and 3rd tape are on their first char
 */
state evalpositive:
  on [0/0/*, 1/1/*] -> move R/R/S;
  -- No hit
  on [1/0/*, 0/1/*, o/1/*, ")"/1/*, ")"/0/*] -> move L/R/S; goto evalpositive_nextvarsearch;
  on [1/#/*, 0/#/*] -> move S/S/S; goto evalpositive_nextvarsearch;
  -- "Good" hit
  on [o/#/1, ")"/#/1] -> move S/S/S; goto nextclause;
  -- "Bad" hit
  on [o/#/0, ")"/#/0] -> move S/S/S; goto reset_second_third_tape;

state evalpositive_nextvarsearch:
  -- Both need to move
  on [1/0/*, 0/1/*, 1/1/*, 0/0/*] -> move L/R/S;
  -- Only first tape
  on [1/#/*, 0/#/*] -> move L/S/S;
  -- Only second tape
  on [n/0/*, o/0/*, "("/0/*, n/1/*, o/1/*, "("/1/*] -> move S/R/S;
  -- Finished
  on [o/#/*, n/#/*, "("/#/*] -> move R/R/R; goto evalpositive;

-- Reset second and third tape and on the first move to next clause; then go eval
state nextclause:
  on */*/* -> move S/S/S; goto movefirsttonextclause;

state movefirsttonextclause:
  on [0/*/*, 1/*/*, o/*/*, n/*/*] -> move R/S/S;
  on ")"/*/* -> move R/S/S; goto movesecondtonextclause;

state movesecondtonextclause:
  on [*/0/*, */1/*, */#/*] -> move S/L/S;
  on */" "/* -> move S/R/S; goto movethirdtonextclause;

state movethirdtonextclause:
  on [*/*/0, */*/1] -> move S/S/L;
  on */*/" " -> move S/S/R; goto eval;

-- Go completely left on second and third tape; then go eval
state reset_second_third_tape:
  -- Both need to move
  on [*/0/1, */1/1, */#/1, */0/0, */1/0, */#/0] -> move S/L/L;
  -- Only second needs to move
  on [*/0/" ", */1/" ", */#/" "] -> move S/L/S;
  -- Only third needs to move
  on [*/" "/1, */" "/0] -> move S/S/L;
  -- Finished
  on */" "/" " -> move S/R/R; goto eval;

/*
 * This mostly is copy of evalpositive
 * Check if assignment of variable is 0
 * Assert: 2nd and 3rd tape are on their first char
 */
state evalnegative:
  on [0/0/*, 1/1/*] -> move R/R/S;
  -- No hit
  on [1/0/*, 0/1/*, o/1/*, ")"/1/*, ")"/0/*] -> move L/R/S; goto evalnegative_nextvarsearch;
  on [1/#/*, 0/#/*] -> move S/S/S; goto evalnegative_nextvarsearch;
  -- "Good" hit
  on [o/#/0, ")"/#/0] -> move S/S/S; goto nextclause;
  -- "Bad" hit
  on [o/#/1, ")"/#/1] -> move S/S/S; goto reset_second_third_tape;

state evalnegative_nextvarsearch:
  -- Both need to move
  on [1/0/*, 0/1/*, 1/1/*, 0/0/*] -> move L/R/S;
  -- Only first tape
  on [1/#/*, 0/#/*] -> move L/S/S;
  -- Only second tape
  on [n/0/*, o/0/*, "("/0/*, n/1/*, o/1/*, "("/1/*] -> move S/R/S;
  -- Finished
  on [o/#/*, n/#/*, "("/#/*] -> move R/R/R; goto evalnegative;

state accept:

state reject:`,
};

ExampleTMs.push(BinaryAdd);
ExampleTMs.push(NonDetSubstring);
ExampleTMs.push(vvWord);
ExampleTMs.push(NonDetSubSetSum);
ExampleTMs.push(CheckEven);
ExampleTMs.push(GCD);
ExampleTMs.push(AllStrings);
ExampleTMs.push(Fib);
ExampleTMs.push(DAG);
ExampleTMs.push(Circle);
ExampleTMs.push(NonDetSAT);
