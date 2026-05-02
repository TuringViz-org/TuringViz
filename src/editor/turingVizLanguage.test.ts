type AdapterModule = typeof import('./turingVizLanguage');

interface HoverModel {
  getValue(): string;
}

interface HoverPosition {
  lineNumber: number;
  column: number;
}

interface HoverProvider {
  provideHover(model: HoverModel, position: HoverPosition): unknown;
}

interface MarkerData {
  severity: number;
  message: string;
  code: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

interface MarkerCall {
  model: HoverModel;
  owner: string;
  markers: MarkerData[];
}

function createMonacoFake() {
  const hoverProviders: HoverProvider[] = [];
  const markerCalls: MarkerCall[] = [];

  const raw = {
    MarkerSeverity: {
      Warning: 4,
      Error: 8,
    },
    languages: {
      register: vi.fn(),
      setLanguageConfiguration: vi.fn(),
      setMonarchTokensProvider: vi.fn(),
      registerHoverProvider: vi.fn((_: string, provider: HoverProvider) => {
        hoverProviders.push(provider);
        return { dispose: vi.fn() };
      }),
    },
    editor: {
      defineTheme: vi.fn(),
      setModelMarkers: vi.fn((
        model: HoverModel,
        owner: string,
        markers: MarkerData[],
      ) => {
        markerCalls.push({ model, owner, markers });
      }),
    },
  };

  return {
    raw,
    hoverProviders,
    markerCalls,
  };
}

async function loadAdapter(): Promise<AdapterModule> {
  vi.resetModules();
  return import('./turingVizLanguage');
}

describe('TuringViz Monaco adapter', () => {
  it('registers the language, configuration, tokenizer, theme, and hover provider once', async () => {
    const adapter = await loadAdapter();
    const { raw, hoverProviders } = createMonacoFake();
    const monaco = raw as unknown as Parameters<
      typeof adapter.registerTuringVizLanguage
    >[0];

    adapter.registerTuringVizLanguage(monaco);
    adapter.registerTuringVizLanguage(monaco);

    expect(raw.languages.register).toHaveBeenCalledTimes(1);
    expect(raw.languages.register).toHaveBeenCalledWith(
      expect.objectContaining({
        id: adapter.LANGUAGE_ID,
        extensions: ['.tvm'],
      }),
    );
    expect(raw.languages.setLanguageConfiguration).toHaveBeenCalledWith(
      adapter.LANGUAGE_ID,
      expect.objectContaining({
        comments: {
          lineComment: '--',
          blockComment: ['/*', '*/'],
        },
      }),
    );
    expect(raw.languages.setMonarchTokensProvider).toHaveBeenCalledTimes(1);
    expect(raw.editor.defineTheme).toHaveBeenCalledWith(
      'turingviz-dark',
      expect.objectContaining({ base: 'vs-dark' }),
    );
    expect(raw.languages.registerHoverProvider).toHaveBeenCalledTimes(1);
    expect(hoverProviders).toHaveLength(1);
  });

  it('uses the registered hover provider to return semantic hover text', async () => {
    const adapter = await loadAdapter();
    const { raw, hoverProviders } = createMonacoFake();
    const monaco = raw as unknown as Parameters<
      typeof adapter.registerTuringVizLanguage
    >[0];
    const source = `tapes: 1
blank: _
input: ""
start: q0

state q0:
`;

    adapter.registerTuringVizLanguage(monaco);
    const hover = hoverProviders[0].provideHover(
      { getValue: () => source },
      { lineNumber: 1, column: 2 },
    );

    expect(hover).toMatchObject({
      contents: [
        {
          value: expect.stringContaining('Declares how many tapes'),
        },
      ],
    });
  });

  it('returns null from the hover provider when no semantic hover exists', async () => {
    const adapter = await loadAdapter();
    const { raw, hoverProviders } = createMonacoFake();
    const monaco = raw as unknown as Parameters<
      typeof adapter.registerTuringVizLanguage
    >[0];

    adapter.registerTuringVizLanguage(monaco);
    const hover = hoverProviders[0].provideHover(
      { getValue: () => '\n' },
      { lineNumber: 1, column: 1 },
    );

    expect(hover).toBeNull();
  });

  it('maps parser diagnostics to Monaco model markers', async () => {
    const adapter = await loadAdapter();
    const { raw, markerCalls } = createMonacoFake();
    const monaco = raw as unknown as Parameters<
      typeof adapter.updateTuringVizMarkers
    >[0];
    const model = {
      getValue: () => `tapes: 1
blank: _
alphabet: {0, _}
input: ""
start: q0

state q0:
  on _ -> move X;
`,
    };

    adapter.updateTuringVizMarkers(
      monaco,
      model as unknown as Parameters<typeof adapter.updateTuringVizMarkers>[1],
    );

    expect(raw.editor.setModelMarkers).toHaveBeenCalledTimes(1);
    expect(markerCalls[0]).toMatchObject({
      model,
      owner: 'turingviz-machine-parser',
    });
    expect(markerCalls[0].markers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: raw.MarkerSeverity.Error,
          code: 'PARSE_INVALID_DIRECTION',
          message: 'Expected a move direction: `L`, `R`, or `S`.',
        }),
      ]),
    );
  });

  it('clears markers when the model has no diagnostics', async () => {
    const adapter = await loadAdapter();
    const { raw, markerCalls } = createMonacoFake();
    const monaco = raw as unknown as Parameters<
      typeof adapter.updateTuringVizMarkers
    >[0];
    const model = {
      getValue: () => `tapes: 1
blank: _
alphabet: {0, _}
input: ""
start: q0

state q0:
  on _ -> move S;
`,
    };

    adapter.updateTuringVizMarkers(
      monaco,
      model as unknown as Parameters<typeof adapter.updateTuringVizMarkers>[1],
    );

    expect(markerCalls[0].markers).toEqual([]);
  });

  it('does nothing when no Monaco model is available', async () => {
    const adapter = await loadAdapter();
    const { raw } = createMonacoFake();
    const monaco = raw as unknown as Parameters<
      typeof adapter.updateTuringVizMarkers
    >[0];

    adapter.updateTuringVizMarkers(monaco, null);

    expect(raw.editor.setModelMarkers).not.toHaveBeenCalled();
  });
});
