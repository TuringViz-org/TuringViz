// src/components/TMGraph/edges/EdgeTooltip.tsx
import { useEffect, useRef, useLayoutEffect } from 'react';
import { Popper, ClickAwayListener } from '@mui/material';
import { Paper, Stack, Typography, Chip, Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { VirtualElement } from '@popperjs/core';

import { TapePatternField, Transition } from '@mytypes/TMTypes';
import { useGlobalZustand } from '@zustands/GlobalZustand';

type Props = {
  open: boolean;
  anchorEl: VirtualElement;
  edgeId: string;
  source: string;
  target: string;
  transitions?: Transition[];
  fallbackLines?: string[];
  onClose: () => void;
};

const isSameWrite = (val: any): boolean =>
  !!val && typeof val === 'object' && !('value' in val);

const sym = (val: TapePatternField, blank: string): string => {
  const v =
    val && typeof val === 'object' && 'value' in val ? (val as any).value : val;
  if (v === blank && blank === ' ') return '□';
  return String(v);
};

const wildcard = (val: any): boolean =>
  !(val && typeof val === 'object' && 'value' in val);

const dirSym = (d: any): string => {
  if (d == null) return '—';
  const s = String(d);
  return s;
};

const scrollMemory = new Map<string, number>();

export function EdgeTooltip({
  open,
  anchorEl,
  edgeId,
  source,
  target,
  transitions,
  fallbackLines,
  onClose,
}: Props) {
  // Global Zustand state
  const blank = useGlobalZustand((s) => s.blank);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTop = useRef(scrollMemory.get(edgeId) ?? 0);

  // Remember scroll position on scroll events
  const handleScroll = () => {
    if (scrollRef.current) lastScrollTop.current = scrollRef.current.scrollTop;
    scrollMemory.set(edgeId, lastScrollTop.current);
  };

  // Restore scroll before paint to avoid visible jump on re-renders
  useLayoutEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = lastScrollTop.current;
  });

  // Optional fallback restore after open/length changes
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = lastScrollTop.current;
  }, [open, transitions?.length]);

  useEffect(() => {
    return () => {
      scrollMemory.set(edgeId, lastScrollTop.current);
    };
  }, [edgeId]);

  const hasTransitions = !!transitions && transitions.length > 0;

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="top-start"
      keepMounted
      modifiers={[
        { name: 'offset', options: { offset: [0, 8] } },
        { name: 'preventOverflow', options: { padding: 8 } },
      ]}
      sx={{ zIndex: (t) => t.zIndex.tooltip }}
    >
      <ClickAwayListener onClickAway={onClose}>
        <Paper
          elevation={6}
          sx={{
            p: 1.25,
            borderRadius: 2,
            pointerEvents: 'auto',
            bgcolor: (t) => alpha(t.palette.background.paper, 0.95),
            backdropFilter: 'blur(6px)',
            border: (t) => `1px solid ${alpha(t.palette.divider, 0.32)}`,
            boxShadow: (t) =>
              `0 8px 28px ${alpha(t.palette.common.black, 0.18)}, 0 1px 2px ${alpha(
                t.palette.common.black,
                0.08
              )}`,
            maxWidth: 460,
            overflowAnchor: 'none',
            pr: 1,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 0.5 }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {source} → {target}
            </Typography>
            {hasTransitions && (
              <Chip
                size="small"
                label={`${transitions!.length} transition${transitions!.length > 1 ? 's' : ''}`}
                sx={{ pointerEvents: 'none' }}
              />
            )}
          </Stack>

          {/* Single scroll container */}
          <Box
            ref={scrollRef}
            onScroll={handleScroll}
            sx={{
              maxHeight: 400,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              overflowAnchor: 'none',
            }}
          >
            {hasTransitions ? (
              <Stack spacing={0.75}>
                {transitions!.map((t, idx) => {
                  const tapes = Math.max(
                    t.tapecondition?.length ?? 0,
                    t.write?.length ?? 0,
                    t.direction?.length ?? 0
                  );

                  return (
                    <Box
                      key={idx}
                      sx={{
                        borderRadius: 1.5,
                        border: (th) =>
                          `1px solid ${alpha(th.palette.divider, 0.7)}`,
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        sx={{
                          px: 1,
                          py: 0.5,
                          bgcolor: (th) => th.palette.primary.light,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          Transition {idx + 1}
                        </Typography>
                      </Box>

                      <Box sx={{ px: 1, py: 0.5 }}>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: '64px 1fr 1fr 64px',
                            columnGap: 1,
                            mb: 0.5,
                            opacity: 0.7,
                          }}
                        >
                          <Typography variant="caption">Tape</Typography>
                          <Typography variant="caption">Read</Typography>
                          <Typography variant="caption">Write</Typography>
                          <Typography variant="caption">Move</Typography>
                        </Box>

                        <Stack spacing={0.25}>
                          {Array.from({ length: tapes }).map((_, k) => {
                            const read = t.tapecondition?.[k];
                            const write = t.write?.[k];
                            const move = t.direction?.[k];

                            return (
                              <Box
                                key={k}
                                sx={{
                                  display: 'grid',
                                  gridTemplateColumns: '64px 1fr 1fr 64px',
                                  columnGap: 1,
                                  alignItems: 'center',
                                  px: 0,
                                }}
                              >
                                <Typography
                                  variant="body2"
                                  sx={{ fontVariantNumeric: 'tabular-nums' }}
                                >
                                  #{k + 1}
                                </Typography>

                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontFamily: (t) =>
                                      t.typography.fontFamilyMonospace,
                                  }}
                                >
                                  {wildcard(read) ? '-' : sym(read, blank)}
                                </Typography>

                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontFamily: (t) =>
                                      t.typography.fontFamilyMonospace,
                                  }}
                                >
                                  {wildcard(write)
                                    ? '-'
                                    : isSameWrite(write)
                                      ? sym(read, blank)
                                      : sym(write, blank)}
                                </Typography>

                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontFamily: (t) =>
                                      t.typography.fontFamilyMonospace,
                                  }}
                                >
                                  {dirSym(move)}
                                </Typography>
                              </Box>
                            );
                          })}
                        </Stack>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            ) : (
              // Fallback if the transitions are not available
              (fallbackLines ?? []).length > 0 && (
                <Stack spacing={0.25}>
                  {fallbackLines!.map((line, idx) => (
                    <Typography key={idx} variant="body2">
                      {line}
                    </Typography>
                  ))}
                </Stack>
              )
            )}
          </Box>
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}
