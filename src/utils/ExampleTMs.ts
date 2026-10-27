type ExampleTM = {
  name: string;
  code: string;
};

// Load source text eagerly so the menu does not need runtime file requests.
const exampleSources = import.meta.glob<string>('../examples/**/*.tvm', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const ExampleTMs: ExampleTM[] = [];

function registerExample(name: string, file: string): ExampleTM {
  const code = exampleSources[`../examples/${file}`];
  if (code === undefined) {
    throw new Error(
      `Example TM "${name}" references a missing file: src/examples/${file}`
    );
  }

  const example = { name, code };
  ExampleTMs.push(example);
  return example;
}

// Add the .tvm file to src/examples, then register its display name and filename.
// Filenames are relative to src/examples; registration order is the menu order.
export const BinaryAdd = registerExample('BinaryAdd', 'BinaryAdd.tvm');
export const NonDetSubstring = registerExample(
  'NonDetSubstring',
  'NonDetSubstring.tvm'
);
export const vvWord = registerExample('vvWord', 'vvWord.tvm');
export const NonDetSubSetSum = registerExample(
  'NonDetSubSetSum',
  'NonDetSubSetSum.tvm'
);
export const CheckEven = registerExample('CheckEven', 'CheckEven.tvm');
export const ZeroNOneN = registerExample('0^n1^n', 'ZeroNOneN.tvm');
export const GCD = registerExample('GCD', 'GCD.tvm');
export const AllStrings = registerExample('AllStrings', 'AllStrings.tvm');
export const Fib = registerExample('Fib', 'Fib.tvm');
export const DAG = registerExample('DAG', 'DAG.tvm');
export const Circle = registerExample('Circle', 'Circle.tvm');
export const NonDetSAT = registerExample('NonDetSAT', 'NonDetSAT.tvm');
export const UniversalTM = registerExample('UniversalTM', 'Universal.tvm');
