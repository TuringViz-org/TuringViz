// src/components/CodeEditor.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, Button } from '@mui/material';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import { configureMonacoYaml } from 'monaco-yaml';
import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';

import YamlWorker from '../../workers/yaml.worker?worker';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { parseYaml } from '@utils/parsing';
import { useEditorZustand } from '@zustands/EditorZustand';
import { useGraphZustand } from '@zustands/GraphZustand';
import { ConfigNodeMode, DEFAULT_TREE_DEPTH } from '@utils/constants';

const SCHEMA_URL = `${import.meta.env.BASE_URL}turingMachineSchema.json`;
const MODEL_URI = 'inmemory://model/turingMachine.yaml'; // Can be any unique URI

const CodeEditor: React.FC = () => {
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monacoEditor.editor.ITextModel | null>(null);
  const monacoRef = useRef<typeof monacoEditor | null>(null);
  const markersRef = useRef<monacoEditor.editor.IMarkerData[]>([]);
  const clearListenerRef = useRef<monacoEditor.IDisposable | null>(null);

  // State to track if the current content is "clean" (matches last loaded)
  const lastLoadedValueRef = useRef<string>(''); // the last successfully loaded content
  const contentListenerRef = useRef<monacoEditor.IDisposable | null>(null);
  const [isClean, setIsClean] = useState<boolean>(false); // true if current content matches lastLoadedValue

  // Graph Zustand setters
  const setConfigGraphNodeMode = useGraphZustand((s) => s.setConfigGraphNodeMode);
  const setComputationTreeNodeMode = useGraphZustand(
    (s) => s.setComputationTreeNodeMode
  );
  const setComputationTreeDepth = useGraphZustand((s) => s.setComputationTreeDepth);

  const { code, nonce } = useEditorZustand();

  const handleLoadClick = () => {
    const monaco = monacoRef.current;
    const model = modelRef.current;
    const editor = editorRef.current;
    if (!monaco || !model || !editor) return;

    // Clear any existing markers
    monaco.editor.setModelMarkers(model, 'manual', []);
    clearListenerRef.current?.dispose();
    clearListenerRef.current = null;

    // Parse the YAML content from the editor
    const currentValue = editor.getValue();
    const errors = parseYaml(currentValue);

    if (errors.length === 0) {
      // If there are no errors, mark as clean and
      // update last loaded value, return early
      if (!isClean) {
        setComputationTreeDepth(DEFAULT_TREE_DEPTH);
      }

      lastLoadedValueRef.current = currentValue;
      setIsClean(true);
      setConfigGraphNodeMode(ConfigNodeMode.CIRCLES);
      setComputationTreeNodeMode(ConfigNodeMode.CIRCLES);

      console.log('Machine loaded successfully!');
      return;
    }

    // If there are errors, mark as dirty
    setIsClean(currentValue === lastLoadedValueRef.current);

    // print the errors to the console for debugging
    console.error('YAML parsing errors:', errors);

    // Create the markers from the errors
    const markers = errors.map((e) => ({
      startLineNumber: e.linePos,
      endLineNumber: e.linePos,
      startColumn: e.startColumn,
      endColumn: e.endColumn,
      message: e.message,
      severity: monaco.MarkerSeverity.Error,
    }));

    monaco.editor.setModelMarkers(model, 'manual', markers);
    markersRef.current = markers;

    // Register a listener to clear markers when the corresponding lines are modified
    clearListenerRef.current = model.onDidChangeContent((e) => {
      const intersects = (
        change: monacoEditor.editor.IModelContentChange,
        m: monacoEditor.editor.IMarkerData
      ) => {
        const line = change.range.startLineNumber;
        const sameRow =
          m.startLineNumber === m.endLineNumber && line === m.startLineNumber;
        if (line < m.startLineNumber || line > m.endLineNumber) return false;
        if (!sameRow) return true;
        return !(
          change.range.endColumn <= m.startColumn ||
          change.range.startColumn >= m.endColumn
        );
      };

      const remaining = markersRef.current.filter(
        (m) => !e.changes.some((ch) => intersects(ch, m))
      );

      if (remaining.length !== markersRef.current.length) {
        monaco.editor.setModelMarkers(model, 'manual', remaining);
        markersRef.current = remaining;
      }

      if (!remaining.length) {
        clearListenerRef.current?.dispose();
        clearListenerRef.current = null;
      }
    });
  };

  // Execute beforeMount to configure Monaco before the editor is mounted
  const beforeMount: BeforeMount = useCallback((monaco) => {
    monacoRef.current = monaco;
    (window as any).MonacoEnvironment = {
      getWorker(_moduleId: string, label: string) {
        if (label === 'yaml') return new YamlWorker();
        return new EditorWorker();
      },
    };

    configureMonacoYaml(monaco as typeof monacoEditor, {
      enableSchemaRequest: true, // Allow the editor to "download" schemas
      validate: true,
      hover: true,
      completion: true,
      format: true,
      schemas: [
        {
          uri: SCHEMA_URL,
          fileMatch: [MODEL_URI],
        },
      ],
    });
  }, []);

  // Update the editor content when `code` in zustand changes
  useEffect(() => {
    const model = modelRef.current;
    const editor = editorRef.current;
    if (!model || !editor) return;

    // Nur updaten, wenn der Text wirklich anders ist
    if (model.getValue() !== code || typeof nonce === 'number') {
      // kompletter Inhalt aus dem Zustand setzen
      model.setValue(code);

      // nach externer Aktualisierung direkt validieren
      handleLoadClick();
    }
  }, [code, nonce]);

  // Focus the editor when it mounts
  const onMount: OnMount = useCallback((editor) => {
    editor.focus();
    editorRef.current = editor; // Store the editor instance in the ref
    modelRef.current = editor.getModel();

    // Clean up any previous listener
    contentListenerRef.current?.dispose();
    contentListenerRef.current =
      modelRef.current?.onDidChangeContent(() => {
        const v = modelRef.current?.getValue() ?? '';
        setIsClean(v === lastLoadedValueRef.current);
      }) ?? null;

    // Initial check against (still empty) lastLoadedValue
    setIsClean((modelRef.current?.getValue() ?? '') === lastLoadedValueRef.current);

    // Load what's in the editor
    handleLoadClick();
  }, []);

  // Clean up listeners on unmount
  useEffect(() => {
    return () => {
      contentListenerRef.current?.dispose();
      clearListenerRef.current?.dispose();
    };
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        contain: 'size',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ mb: 0, flexShrink: 0 }}
      >
        <Button
          fullWidth
          size="small"
          variant="contained"
          color={isClean ? 'primary' : 'accent'}
          onClick={handleLoadClick}
        >
          Load Machine
        </Button>
      </Stack>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          border: '1px solid #ccc',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <Editor
          defaultLanguage="yaml"
          path={MODEL_URI}
          defaultValue={code}
          beforeMount={beforeMount}
          onMount={onMount}
          options={{ fontSize: 14, minimap: { enabled: false }, wordWrap: 'on' }}
          height="100%"
        />
      </div>
    </div>
  );
};

export default CodeEditor;
