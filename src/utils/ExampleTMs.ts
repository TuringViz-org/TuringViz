type ExampleTM = {
  name: string;
  code: string;
};

export const ExampleTMs: ExampleTM[] = [];

export const CheckEven: ExampleTM = {
  name: 'CheckEven',
  code: `# Checks if the number of 1's in the input
# (consisting of 0's and 1's) is even
input: '101100001100000111000000000011111'
blank: ' '
tapes: 1
startstate: even
table:
  even:
    '1': {'R': odd}
    '0': 'R'
    ' ': {'S': accept}
  odd:
    '1': {'R': even}
    '0': 'R'
    ' ': {'S': reject}
  accept: {}
  reject: {}`,
};

export const GCD: ExampleTM = {
  name: 'GCD',
  code: `# Computes the GCD of two numbers in unary
tapes: 4
input: "000000#0000///" # Example input: 6 and 2 in unary ("000000" and "000")
blank: " "
startstate: copy_first
table:
  copy_first:
    '0/ / / ': {write: "same/0/same/same", 'R/R/S/S'}
    '#/ / / ': {"R/S/S/S": copy_second}
  copy_second:
    '0/ / / ': {write: "same/same/0/same", "R/S/R/S"}
    ' / / / ': {"L/L/L/S": move_to_begin}
  move_to_begin:
    '[0/0/0/ , #/0/0/ ]': "L/L/L/S"
    '[0/0/ / , #/0/ / ]': "L/L/S/S"
    '[0/ / / , #/ / / ]': "L/S/S/S"
    '[0/ /0/ , #/ /0/ ]': "L/S/L/S"
    ' /0/ / ': "S/L/S/S"
    ' / /0/ ': "S/S/L/S"
    ' / / / ': {"R/R/R/S": euclid}
  euclid:
    'all/0/0/ ': "S/R/R/S"
    'all/ /0/ ': {"S/L/R/S": firstsmaller_goright}
    'all/0/ / ': {"S/R/L/S": secondsmaller_goright}
    'all/ / / ': {"S/L/L/S": copy_result}
  firstsmaller_goright:
    'all/0/0/ ': "S/S/R/S"
    'all/0/ / ': {"S/S/L/S": firstsmaller_substract}
  secondsmaller_goright:
    'all/0/0/ ': "S/R/S/S"
    'all/ /0/ ': {"S/L/S/S": secondsmaller_substract}
  firstsmaller_substract:
    'all/0/0/ ': {"S/L/L/S", write: "same/0/ / "}
    'all/ /0/ ': {"S/S/S/S": move_to_begin}
  secondsmaller_substract:
    'all/0/0/ ': {"S/L/L/S", write: "same/ /0/ "}
    'all/0/ / ': {"S/S/S/S": move_to_begin}
  copy_result:
    'all/0/0/ ': {"S/L/L/R", write: "same/same/same/0"}
    'all/ / / ': {"S/R/R/L": finish_up}
  finish_up:
    'all/all/all/0': "S/S/S/L"
    'all/all/all/ ': {"S/S/S/R": accept}
  accept: {}
`,
};

export const AllStrings: ExampleTM = {
  name: 'AllStrings',
  code: `# Generating all possible strings of given length, consisting of 0's and 1's
tapes: 1
input: "000" # length 3
blank: " "
startstate: generate
table:
  generate:
    "0": [{write: "0", "R"}, {write: "1", "R"}]
    " ": {"S": done}
  done: {}`,
};

export const SelfLoops: ExampleTM = {
  name: 'Self Loops',
  code: `# Generating graph with self loops
input: '000000' # length 6
blank: ' '
tapes: 1
startstate: go
table:
  go:
    '0': ["R", "S"]
    ' ': {"S": done}
  done: {}`,
};

export const DAG: ExampleTM = {
  name: 'DAG',
  code: `# Computing a config graph that is a DAG
input: '000000' # length 6
blank: ' '
tapes: 1
startstate: go
table:
  go:
    '0': ["R", {"S": goright}]
    ' ': {"S": done}
  goright:
    '0': {"R": go}
  done: {}`,
};

export const Circle: ExampleTM = {
  name: 'Circle',
  code: `# Creates a config graph that is a circle
input: '0'
blank: ' '
tapes: 1
startstate: goright
table:
  goright:
    "0": "R"
    " ": {"L": goleft}
  goleft:
    "0": "L"
    " ": {"R": goright}`,
};

export const BinaryAdd: ExampleTM = {
  name: 'BinaryAdd',
  code: `# Binary addition on 2 tapes with output on tape 3
input: '111010/1111'
blank: ' '
tapes: 3
startstate: goright
table:
  goright:
    '[1/1/all, 1/0/all, 0/1/all, 0/0/all]': "R/R/S"
    '[1/ /all, 0/ /all]': "R/S/S"
    '[ /1/all,  /0/all]': "S/R/S"
    ' / /all': {"L/L/S": add}
  add:
    '1/1/all': {write: 'same/same/0', "L/L/L": carry}
    '[1/0/all, 0/1/all, 1/ /all,  /1/all]': {write: 'same/same/1', "L/L/L": add}
    '[0/0/all, 0/ /all,  /0/all]': {write: 'same/same/0', "L/L/L": add}
  carry:
    '1/1/all': {write: 'same/same/1', "L/L/L": carry}
    '[1/0/all, 0/1/all, 1/ /all,  /1/all]': {write: 'same/same/0', "L/L/L": carry}
    '[0/0/all, 0/ /all,  /0/all]': {write: 'same/same/1', "L/L/L": add}
    ' / /all': {write: 'same/same/1', "S/S/S": done}
  done: {}`,
};

export const NonDetSubstring: ExampleTM = {
  name: 'NonDetSubstring',
  code: `# Contains substring (nondeterministic)
# Input: First tape is the input string, second tape is the string searched in the first.
input: '111010/101'
blank: ' '
tapes: 2
startstate: goright
table:
  # Go right and compare
  goright:
    # Guess that this is the beginning of the substring
    '[1/0, 0/1, 1/1, 0/0]':
      - {"R/S": goright}
      - {"S/S": compare}
    '[ /1, 1/ , 0/ ,  /0,  / ]': {"S/S": reject}
  compare:
    '[1/1, 0/0]': "R/R"
    '[ / , 1/ , 0/ ]': {"S/S": accept}
    '[1/0, 0/1,  /1, /0]': {"S/S": reject}
  accept: {}
  reject: {}`,
};

export const vvWord: ExampleTM = {
  name: 'vvWord',
  code: `# Check if string is two times the same string
# Input: A string w. Program checks (non-det) if w = vv for some string v
input: '010010'
blank: ' '
tapes: 2
startstate: gobyone
table:
  gobyone:
    'all/all': {"R/S": goright}
  goright:
    # Go right or choose this location as the middle
    '[0/all, 1/all]':
      - "R/S"
      - {"S/S": copydown}
    ' /all': {"S/S": reject}
  # Copy the remaining string
  copydown:
    '0/all': {write: " /0", "R/R"}
    '1/all': {write: " /1", "R/R"}
    ' /all': {"S/L": gotoendfirst}
  gotoendfirst:
    ' /all': "L/S"
    '[1/all, 0/all]': {"S/S": gotobegin}
  gotobegin:
    '[1/1, 0/0, 1/0, 0/1]': "L/L"
    '[1/ , 0/ ]': "L/S"
    '[ /1,  /0]': "S/L"
    ' / ': {"R/R": compare}
  # Compare if the split creates two strings that are the same
  compare:
    '[1/1, 0/0]': "R/R"
    ' / ': {"S/S": accept}
    '[1/0, 0/1,  /1,  /0, 1/ , 0/ ]': {"S/S": reject}
  accept: {}
  reject: {}`,
};

export const NonDetSubSetSum: ExampleTM = {
  name: 'NonDetSubSetSum',
  code: `# This Turing machine solves SubSetSum non-deterministically in linear time.
# Input: #n1#n2#n3#n4#....# on the first tape and the desired sum n on the second tape.
# Every number is in binary.
input: '#100#11#10#101#/1000'
blank: ' '
tapes: 3
startstate: choose
table:
  # Decide whether to take that number into the sum or not
  choose:
    '#/all/all': "R/S/S"
    '[1/all/all, 0/all/all]':
      - {"S/S/S": skip}
      - {"S/S/S": take}
    ' /all/all': {"S/S/S": goforcompare}
  # Skip the number
  skip:
    '[0/all/all, 1/all/all]': "R/S/S"
    '#/all/all': {"R/S/S": choose}
  # Take the number to the sum
  # For this: first go right until the end of that number
  take:
    '[1/all/all, 0/all/all]': "R/S/S"
    '#/all/all': {"L/S/S": add}
    ' /all/all': {"S/S/S": goforcompare}
  # Add the number to the sum
  add:
    '[0/all/0, 0/all/1]': "L/S/L"
    '[1/all/0, 1/all/ ]': {write: "same/same/1", "L/S/L"}
    '0/all/ ': {write: "same/same/0", "L/S/L"}
    '1/all/1': {write: "same/same/0", "L/S/L": carry}
    '#/all/all': {"R/S/R": continue}
  carry:
    '0/all/0': {write: "same/same/1", "L/S/L": add}
    '[1/all/0, 0/all/1, 1/all/ ]': {write: "same/same/0", "L/S/L": carry}
    '[#/all/0, 0/all/ , #/all/ ]': {write: "same/same/1", "R/S/R": continue}
    '#/all/1': {write: "same/same/0", "S/S/L": carry}
    '1/all/0': "L/S/L"
    '1/all/1': {write: "same/same/1", "L/S/L": carry}
  # Go completely right on the sum on tape 3 and the number we are currently looking at on tape 1
  continue:
    '[1/all/1, 0/all/0, 1/all/0, 0/all/1]': "R/S/R"
    '[#/all/1, #/all/0]': "S/S/R"
    '[0/all/ , 1/all/ ]': "R/S/S"
    '#/all/ ': {"R/S/L": choose}
  # Compare if the calculated sum is the desired sum
  # Go left for being able to compare
  goforcompare:
    '[all/1/1, all/0/0, all/1/0, all/0/1]': "S/L/L"
    '[all/ /1, all/ /0]': "S/S/L"
    '[all/1/ , all/0/ ]': "S/L/S"
    'all/ / ': {"S/R/R": compare}
  # Actually compare both numbers
  compare:
    '[all/1/1, all/0/0]': "S/R/R"
    'all/ / ': {"S/S/S": accept}
    '[all/1/0, all/1/ , all/0/1, all/0/ , all/ /1, all/ /0]': {"S/S/S": reject}
  accept: {}
  reject: {}`,
};

export const NonDetSAT: ExampleTM = {
  name: 'NonDetSAT',
  code: `# SAT solver: accept if CNF formula is satisfiable, reject otherwise
# Explanation: n = not; o = or; a = and; Formula must be in CNF; Every clause needs braces
input: '(n101o10on100)a(n10o100o101)a(n11on10o111)a(n100o110on111)'
blank: ' '
tapes: 3
startstate: variables
table:
  # Identification of variables and writing them on tape 2
  variables:
    '[(/all/all, n/all/all, o/all/all, )/all/all, a/all/all]': "R/S/S"
    '[1/all/all, 0/all/all]': {"S/S/S": findvar}
    # Finished
    '[ /0/all,  /1/all]': {"L/L/S": goleftfirsttape}
  # Find the variable in the variables
  findvar:
    # Compare variables

    # Case: same char
    '[1/1/all, 0/0/all]': "R/R/S" # Just continue comparing

    # Case: different char
    # Case 1: no match
    '[1/0/all, 1/#/all, 0/1/all, 0/#/all, a/0/all, o/0/all, (/0/all, )/0/all, a/1/all, o/1/all, (/1/all, )/1/all]': {"L/S/S": goleftonevarfirst_gorightonevarsecond}

    # Case 2: match
    '[o/#/all, a/#/all, (/#/all, )/#/all, n/#/all]': {"S/S/S": gorightonefirst_goleftsecond}

    # Case: variable tape empty here
    '[1/ /all, 0/ /all]': {"S/S/S": writedownvariable}

  # Go left one var on first tape and right one var on second tape
  goleftonevarfirst_gorightonevarsecond:
    # Finished
    '[(/#/all, )/#/all, a/#/all, o/#/all, n/#/all]': {"S/R/S": variables}
    # First tape and second tape still need to move
    '[0/1/all, 0/0/all, 1/0/all, 1/1/all]': "L/R/S"
    # Only first tape still needs to move
    '[0/#/all, 1/#/all]': "L/S/S"
    # Only second tape still needs to move
    '[a/0/all, o/0/all, (/0/all, )/0/all, n/0/all, a/1/all, o/1/all, (/1/all, )/1/all, n/1/all]': "S/R/S"

  # Write down variable that hasn't been "registered" yet
  writedownvariable:
    '1/all/all': {write: 'same/1/same', "R/R/S"}
    '0/all/all': {write: "same/0/same", "R/R/S"}
    '[(/all/all, n/all/all, o/all/all, )/all/all]': {write: "same/#/same", "S/L/S": gorightonefirst_goleftsecond}
  gorightonefirst_goleftsecond:
    # Finished
    '[(/ /all, )/ /all, a/ /all, o/ /all, n/ /all]': {"S/R/S": variables}
    # First tape finished, second not
    '[(/1/all, )/1/all, a/1/all, o/1/all, n/1/all, (/0/all, )/0/all, a/0/all, o/0/all, n/0/all, (/#/all, )/#/all, a/#/all, o/#/all, n/#/all]': "S/L/S"
    # Both tapes not finished
    '[0/1/all, 1/1/all, 0/0/all, 1/0/all, 0/#/all, 1/#/all]': "R/L/S"

  goleftfirsttape:
    '[1/all/all, 0/all/all, o/all/all, a/all/all, n/all/all, (/all/all, )/all/all]': "L/S/S"
    ' / /all': {"R/R/S": guessassignment}

  guessassignment:
    # Write string of 1s and 0s on the third tape. For each variable one char
    '[all/0/all, all/1/all]': [{write: "same/same/1", "S/R/R": nextvar}, {write: "same/same/0", "S/R/R": nextvar}]
    # Finished
    'all/ / ': {"S/L/L": goeval}

  nextvar:
    # Skip the var on second tape
    '[all/0/all, all/1/all]': "S/R/S"
    # Finished
    '[all/#/all]': {"S/R/S": guessassignment}

  goeval:
    # Go left on second and third tape until there is no more to go
    # Both tapes
    '[all/0/0, all/0/1, all/1/0, all/1/1, all/#/0, all/#/1]': "S/L/L"
    # Just second tape
    '[all/0/ , all/1/ , all/#/ ]': "S/L/S"
    # Just third tape
    '[all/ /0, all/ /1]': "S/S/L"
    # Finished
    '[all/ / ]': {"S/R/R": eval}

  # Go through clause from left to right and check for true in this clause
  # Assert: 2nd and 3rd tape are on their first char
  eval:
    ')/all/all': {"S/S/S": reject}
    '[(/all/all, a/all/all, o/all/all]': "R/S/S"
    ' /all/all': {"S/S/S": accept}
    '[0/all/all, 1/all/all]': {"S/S/S": evalpositive}
    'n/all/all': {"R/S/S": evalnegative}

  # Check if assignment of variable is 1
  # Assert: 2nd and 3rd tape are on their first char
  evalpositive:
    '[0/0/all, 1/1/all]': "R/R/S"
    # No hit
    '[1/0/all, 0/1/all, o/1/all, )/1/all, )/0/all]': {"L/R/S": evalpositive_nextvarsearch}
    '[1/#/all, 0/#/all]': {"S/S/S": evalpositive_nextvarsearch}
    # "Good" hit
    '[o/#/1, )/#/1]': {"S/S/S": nextclause}
    # "Bad" hit
    '[o/#/0, )/#/0]': {"S/S/S": reset_second_third_tape}

  evalpositive_nextvarsearch:
    # Both need to move
    '[1/0/all, 0/1/all, 1/1/all, 0/0/all]': "L/R/S"
    # Only first tape
    '[1/#/all, 0/#/all]': "L/S/S"
    # Only second tape
    '[n/0/all, o/0/all, (/0/all, n/1/all, o/1/all, (/1/all]': "S/R/S"
    # Finished
    '[o/#/all, n/#/all, (/#/all]': {"R/R/R": evalpositive}

  # Reset second and third tape and on the first move to next clause; then go eval
  nextclause:
    'all/all/all': {"S/S/S": movefirsttonextclause}
  movefirsttonextclause:
    '[0/all/all, 1/all/all, o/all/all, n/all/all]': "R/S/S"
    ')/all/all': {"R/S/S": movesecondtonextclause}
  movesecondtonextclause:
    '[all/0/all, all/1/all, all/#/all]': "S/L/S"
    'all/ /all': {"S/R/S": movethirdtonextclause}
  movethirdtonextclause:
    '[all/all/0, all/all/1]': "S/S/L"
    'all/all/ ': {"S/S/R": eval}

  # Go completely left on second and third tape; then go eval
  reset_second_third_tape:
    # Both need to move
    '[all/0/1, all/1/1, all/#/1, all/0/0, all/1/0, all/#/0]': "S/L/L"
    # Only second needs to move
    '[all/0/ , all/1/ , all/#/ ]': "S/L/S"
    # Only third needs to move
    '[all/ /1, all/ /0]': "S/S/L"
    # Finished
    'all/ / ': {"S/R/R": eval}

  # This mostly is copy of evalpositive
  # Check if assignment of variable is 0
  # Assert: 2nd and 3rd tape are on their first char
  evalnegative:
    '[0/0/all, 1/1/all]': "R/R/S"
    # No hit
    '[1/0/all, 0/1/all, o/1/all, )/1/all, )/0/all]': {"L/R/S": evalnegative_nextvarsearch}
    '[1/#/all, 0/#/all]': {"S/S/S": evalnegative_nextvarsearch}
    # "Good" hit
    '[o/#/0, )/#/0]': {"S/S/S": nextclause}
    # "Bad" hit
    '[o/#/1, )/#/1]': {"S/S/S": reset_second_third_tape}

  evalnegative_nextvarsearch:
    # Both need to move
    '[1/0/all, 0/1/all, 1/1/all, 0/0/all]': "L/R/S"
    # Only first tape
    '[1/#/all, 0/#/all]': "L/S/S"
    # Only second tape
    '[n/0/all, o/0/all, (/0/all, n/1/all, o/1/all, (/1/all]': "S/R/S"
    # Finished
    '[o/#/all, n/#/all, (/#/all]': {"R/R/R": evalnegative}

  accept: {}
  reject: {}`,
};

ExampleTMs.push(BinaryAdd);
ExampleTMs.push(NonDetSubstring);
ExampleTMs.push(vvWord);
ExampleTMs.push(NonDetSubSetSum);
ExampleTMs.push(CheckEven);
ExampleTMs.push(GCD);
ExampleTMs.push(AllStrings);
ExampleTMs.push(SelfLoops);
ExampleTMs.push(DAG);
ExampleTMs.push(Circle);
ExampleTMs.push(NonDetSAT);
