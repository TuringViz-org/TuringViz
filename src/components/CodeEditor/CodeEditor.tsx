// src/components/CodeEditor.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, Button, Tooltip } from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';
import { toast } from 'sonner';

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { useEditorZustand } from '@zustands/EditorZustand';
import { useGraphZustand } from '@zustands/GraphZustand';
import { ConfigNodeMode, DEFAULT_TREE_DEPTH } from '@utils/constants';
import { buildSharedMachineUrl, hasSharedMachineInHash } from '@utils/shareTmLink';
import {
  LANGUAGE_ID,
  registerTuringVizLanguage,
  updateTuringVizMarkers,
} from '../../editor/turingVizLanguage';
import { loadTuringMachineFromSource } from '../../tmLanguage/loadMachine';

const MODEL_URI = 'inmemory://model/turingMachine.tvm';

const CodeEditor: React.FC = () => {
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monacoEditor.editor.ITextModel | null>(null);
  const monacoRef = useRef<typeof monacoEditor | null>(null);
  const lastHandledAutoLoadVersionRef = useRef(0);

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

  const { code, nonce, autoLoadVersion, rememberRecentMachine } = useEditorZustand();

  const handleLoadClick = useCallback((recordRecent = false) => {
    const monaco = monacoRef.current;
    const model = modelRef.current;
    const editor = editorRef.current;
    if (!monaco || !model || !editor) return;

    const currentValue = editor.getValue();
    if (recordRecent) {
      rememberRecentMachine(currentValue);
    }

    const diagnostics = loadTuringMachineFromSource(currentValue);
    const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
    updateTuringVizMarkers(monaco, model);

    if (errors.length === 0) {
      // If there are no errors, mark as clean and
      // update last loaded value, return early
      if (!isClean) {
        setComputationTreeDepth(DEFAULT_TREE_DEPTH);
      }

      lastLoadedValueRef.current = currentValue;
      setIsClean(true);
      setConfigGraphNodeMode(ConfigNodeMode.NODES);
      setComputationTreeNodeMode(ConfigNodeMode.NODES);
      return;
    }

    // If there are errors, mark as dirty
    setIsClean(currentValue === lastLoadedValueRef.current);

    if (import.meta.env.DEV) {
      console.error('TuringViz machine parsing errors:', errors);
    }
  }, [
    isClean,
    rememberRecentMachine,
    setComputationTreeDepth,
    setConfigGraphNodeMode,
    setComputationTreeNodeMode,
  ]);

  const handleShareClick = async () => {
    const editor = editorRef.current;
    if (!editor) {
      toast.warning('Editor is not ready yet.');
      return;
    }

    const shareUrl = await buildSharedMachineUrl(editor.getValue());
    if (!shareUrl) {
      toast.warning('Cannot share an empty machine description.');
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Share link copied to clipboard.');
        return;
      }
    } catch {
      // Fall through to prompt fallback.
    }

    window.prompt('Copy this share link:', shareUrl);
  };

  // Execute beforeMount to configure Monaco before the editor is mounted
  const beforeMount: BeforeMount = useCallback((monaco) => {
    monacoRef.current = monaco;
    (window as any).MonacoEnvironment = {
      getWorker() {
        return new EditorWorker();
      },
    };

    registerTuringVizLanguage(monaco as typeof monacoEditor);
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

      if (autoLoadVersion > lastHandledAutoLoadVersionRef.current) {
        lastHandledAutoLoadVersionRef.current = autoLoadVersion;
        handleLoadClick();
      }
    }
  }, [code, nonce, autoLoadVersion]);

  // Focus the editor when it mounts
  const onMount: OnMount = useCallback((editor, monaco) => {
    editor.focus();
    editorRef.current = editor; // Store the editor instance in the ref
    modelRef.current = editor.getModel();
    updateTuringVizMarkers(monaco as typeof monacoEditor, modelRef.current);

    // Clean up any previous listener
    contentListenerRef.current?.dispose();
    contentListenerRef.current =
      modelRef.current?.onDidChangeContent(() => {
        const v = modelRef.current?.getValue() ?? '';
        setIsClean(v === lastLoadedValueRef.current);
        updateTuringVizMarkers(monaco as typeof monacoEditor, modelRef.current);
      }) ?? null;

    // Initial check against (still empty) lastLoadedValue
    setIsClean((modelRef.current?.getValue() ?? '') === lastLoadedValueRef.current);

    const hasSharedHash = hasSharedMachineInHash(window.location.hash);
    const hasGistParam = new URLSearchParams(window.location.search).has('gist');
    const shouldAutoLoadDefault = autoLoadVersion === 0 && !hasSharedHash && !hasGistParam;

    if (autoLoadVersion > lastHandledAutoLoadVersionRef.current || shouldAutoLoadDefault) {
      lastHandledAutoLoadVersionRef.current = autoLoadVersion;
      handleLoadClick();
    }

  }, [autoLoadVersion, handleLoadClick]);

  // Clean up listeners on unmount
  useEffect(() => {
    return () => {
      contentListenerRef.current?.dispose();
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
        sx={{
          mb: 0,
          p: 0.75,
          flexShrink: 0,
          minHeight: 50,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: (theme) => theme.palette.background.default,
        }}
      >
        <Button
          size="medium"
          variant="contained"
          color={isClean ? 'primary' : 'accent'}
          onClick={() => handleLoadClick(true)}
          sx={{
            minHeight: '100%',
            borderRadius: 1.5,
            flex: 1,
            textTransform: 'none',
            fontWeight: 700,
          }}
        >
          Load Machine
        </Button>
        <Tooltip title="Create shareable link">
          <Button
            size="medium"
            variant="contained"
            color={isClean ? 'primary' : 'accent'}
            onClick={() => {
              void handleShareClick();
            }}
            startIcon={<ShareIcon />}
            sx={{
              minHeight: '100%',
              borderRadius: 1.5,
              px: 2.25,
              whiteSpace: 'nowrap',
              textTransform: 'none',
              fontWeight: 700,
            }}
          >
            Share
          </Button>
        </Tooltip>
      </Stack>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          border: 'none',
          borderRadius: 0,
          overflow: 'hidden',
        }}
      >
        <Editor
          defaultLanguage={LANGUAGE_ID}
          theme="turingviz-light"
          path={MODEL_URI}
          defaultValue={code}
          beforeMount={beforeMount}
          onMount={onMount}
          options={{
            bracketPairColorization: { enabled: false },
            fontSize: 14,
            guides: { bracketPairs: false, bracketPairsHorizontal: false },
            minimap: { enabled: false },
            wordWrap: 'on',
          }}
          height="100%"
        />
      </div>
    </div>
  );
};

export default CodeEditor;
