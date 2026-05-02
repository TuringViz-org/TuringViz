// src/components/Footer/SiteFooter.tsx
import { ReactNode, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Box,
  Chip,
  Container,
  Divider,
  Grid,
  Paper,
  TextField,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  AccountTreeOutlined,
  DataObjectOutlined,
  ExpandMore,
  GitHub,
  MenuBookOutlined,
  NorthEast,
  SchemaOutlined,
} from '@mui/icons-material';

import { CodeBlock } from './CodeBlock';
import { LanguageLegend } from './LanguageLegend';
import { extractGistId } from '@utils/gist';
import type { AppTab } from '@components/MainPage/appTabs';

type ActionTab = { label: string; render: () => ReactNode };
const GITHUB_REPO_URL = 'https://github.com/TuringViz-org/TuringViz';

const ACTION_TABS: ActionTab[] = [
  {
    label: 'A) Move only',
    render: () => (
      <>
        <Typography variant="body2" sx={{ mb: 1 }}>
          A transition must contain a <code>move</code> action. If <code>goto</code>{' '}
          is omitted, the machine stays in the current state.
        </Typography>
        <CodeBlock
          language="tvm"
          code={`on 0 -> move R;
on 1/0 -> move L/S;
`}
        />
      </>
    ),
  },
  {
    label: 'B) Write + goto',
    render: () => (
      <>
        <Divider sx={{ my: 2 }} />
        <Typography variant="body2" sx={{ mb: 1 }}>
          Add <code>write</code> before <code>move</code> and <code>goto</code> after
          it. Use <code>same</code> to keep the current symbol.
        </Typography>
        <CodeBlock
          language="tvm"
          code={`on 1 -> move R; goto next;
on 2 -> write 0; move L; goto next;
on 0/1 -> write same/same; move R/L; goto step2;
on " "/0 -> write 1/same; move S/R; goto carry;
`}
        />
      </>
    ),
  },
  {
    label: 'C) Nondet. choose',
    render: () => (
      <>
        <Divider sx={{ my: 2 }} />
        <Typography variant="body2" sx={{ mb: 1 }}>
          Use <code>choose</code> to create nondeterministic action alternatives for
          the same read condition.
        </Typography>
        <CodeBlock
          language="tvm"
          code={`on 0 -> choose {
  write 0; move R; goto next;
  write 1; move R; goto next;
}
`}
        />
      </>
    ),
  },
];

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <Stack sx={{ mb: 0.5 }}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box sx={{ display: 'grid', placeItems: 'center' }}>{icon}</Box>
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>
          {title}
        </Typography>
      </Stack>

      {subtitle && (
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          sx={{ mt: 0.25 }}
          title={subtitle}
        >
          {subtitle}
        </Typography>
      )}
    </Stack>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'baseline' }}>
      <Typography variant="body2" sx={{ fontWeight: 700, mt: '2px' }}>
        •
      </Typography>
      <Typography variant="body2">{children}</Typography>
    </Stack>
  );
}

function FooterIntro() {
  return (
    <Grid container spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Grid size={{ xs: 12, md: 8 }}>
        <SectionTitle
          icon={<MenuBookOutlined />}
          title="Learn • Build • Visualize"
          subtitle="A compact guide to Turing Machines, Configuration Graphs, Computation Trees, and the TuringViz machine language."
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Stack
          direction="row"
          spacing={1}
          justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
          flexWrap="wrap"
        >
          <Chip size="small" color="primary" variant="outlined" label="Multi-Tape" />
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label="Nondeterministic"
          />
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label="DSL-powered"
          />
        </Stack>
      </Grid>
    </Grid>
  );
}

function TheoryCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <SectionTitle icon={icon} title={title} subtitle={subtitle} />
      {children}
    </Paper>
  );
}

function TheoryGrid({ activeTab }: { activeTab: AppTab }) {
  const showTm = activeTab === 'input' || activeTab === 'run';
  const showConfiguration =
    activeTab === 'run' ||
    activeTab === 'configurationGraph' ||
    activeTab === 'configurationTree';
  const showConfigGraph = activeTab === 'configurationGraph';
  const showTree = activeTab === 'configurationTree';

  const cardCount = [showTm, showConfiguration, showConfigGraph, showTree].filter(
    Boolean
  ).length;
  const mdSpan = cardCount > 1 ? 6 : 12;

  return (
    <Grid container spacing={2}>
      {showTm && (
        <Grid size={{ xs: 12, md: mdSpan }}>
          <TheoryCard icon={<SchemaOutlined />} title="What is a Turing Machine?">
            <Typography variant="body2" sx={{ mb: 1.25 }}>
              A (possibly nondeterministic) <strong>k-tape Turing Machine</strong> is
              a tuple <em>M = (Q, Σ, Γ, b, k, δ, q₀)</em> where:
            </Typography>
            <Stack spacing={0.5} sx={{ mb: 1.5 }}>
              <Bullet>
                <em>Q</em> finite set of states, <em>q₀ ∈ Q</em> start state.
              </Bullet>
              <Bullet>
                <em>Σ ⊆ Γ \ &#123;b&#125;</em> input alphabet, <em>Γ</em> tape
                alphabet, <em>b</em> blank.
              </Bullet>
              <Bullet>
                <em>k</em> number of tapes.
              </Bullet>
              <Bullet>
                <em>
                  δ: Q × Γ<sup style={{ marginLeft: '2px' }}>k</sup> → 𝒫(Q × Γ
                  <sup style={{ marginLeft: '2px' }}>k</sup> × &#123;L,S,R&#125;
                  <sup style={{ marginLeft: '2px' }}>k</sup>)
                </em>{' '}
                transition relation (set-valued for nondeterminism).
              </Bullet>
            </Stack>
            <Typography variant="body2">
              Each step chooses a transition matching the <em>k</em> symbols under
              the heads, optionally writes new symbols, moves heads (<em>L</em>/
              <em>S</em>/<em>R</em>), and changes state.
            </Typography>
          </TheoryCard>
        </Grid>
      )}

      {showConfiguration && (
        <Grid size={{ xs: 12, md: mdSpan }}>
          <TheoryCard
            icon={<DataObjectOutlined />}
            title="Configuration (Snapshot in a Run)"
          >
            <Typography variant="body2" sx={{ mb: 1.25 }}>
              A <strong>configuration</strong> encodes the current state, head
              positions, and finite tape contents: <em>C = (q, h, T)</em> with{' '}
              <em>q ∈ Q</em>,{' '}
              <em>
                h ∈ ℤ<sup style={{ marginLeft: '2px' }}>k</sup>
              </em>
              , and{' '}
              <em>
                T ∈ B<sup style={{ marginLeft: '2px' }}>k</sup>
              </em>{' '}
              (finite windows of tapes).
            </Typography>
            <Stack spacing={0.5} sx={{ mb: 1.5 }}>
              <Bullet>
                Start configuration <em>C₀(x)</em> places the input words on tapes
                starting at index 0; heads start at 0.
              </Bullet>
              <Bullet>
                One machine step transforms a configuration to its successor using δ.
              </Bullet>
            </Stack>
            <Typography variant="body2">
              Here, <em>B</em> denotes the set of finite tape assignments
              (“windows”): each <em>T ∈ B</em> is a mapping <em>T:[c…d] → Γ</em> for
              some integers <em>c ≤ d</em>, i.e., a contiguous finite segment of tape
              cells labeled with symbols from <em>Γ</em>.
            </Typography>
          </TheoryCard>
        </Grid>
      )}

      {showConfigGraph && (
        <Grid size={{ xs: 12, md: mdSpan }}>
          <TheoryCard icon={<SchemaOutlined />} title="Configuration Graph">
            <Typography variant="body2" sx={{ mb: 1.25 }}>
              For a fixed input <em>x</em>, nodes are all configurations reachable
              from <em>C₀(x)</em>. A directed edge <em>C → C′</em> represents one
              step. Deterministic machines have ≤1 outgoing edge per node;
              nondeterministic machines may branch.
            </Typography>
            <Stack spacing={0.5}>
              <Bullet>
                Start node is <em>C₀(x)</em>. Leaves are halting configurations.
              </Bullet>
              <Bullet>
                In the app, you can inspect the compact circle visualization and
                highlight the current configuration.
              </Bullet>
            </Stack>
          </TheoryCard>
        </Grid>
      )}

      {showTree && (
        <Grid size={{ xs: 12, md: mdSpan }}>
          <TheoryCard icon={<AccountTreeOutlined />} title="Computation Tree">
            <Typography variant="body2" sx={{ mb: 1.25 }}>
              The tree “unrolls” the run history from <em>C₀(x)</em>: each node’s
              children are its immediate successors. The same configuration may
              appear multiple times if reached via different paths.
            </Typography>
            <Stack spacing={0.5}>
              <Bullet>
                Every root-to-leaf path corresponds to one possible run.
              </Bullet>
              <Bullet>
                In the app, compute the tree up to a chosen target number of nodes
                and inspect branches interactively.
              </Bullet>
            </Stack>
          </TheoryCard>
        </Grid>
      )}
    </Grid>
  );
}

function MachineActionsTabs({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const active = ACTION_TABS[value] ?? ACTION_TABS[0];

  return (
    <>
      <Tabs
        value={value}
        onChange={(_, newValue: number) => onChange(newValue)}
        variant="fullWidth"
        sx={{ mb: 1 }}
      >
        {ACTION_TABS.map((tab, idx) => (
          <Tab key={tab.label} label={tab.label} value={idx} />
        ))}
      </Tabs>
      {active.render()}
    </>
  );
}

function MachineLanguageSection({
  actionTab,
  onActionTabChange,
}: {
  actionTab: number;
  onActionTabChange: (value: number) => void;
}) {
  return (
    <Box sx={{ mt: 3 }}>
      <SectionTitle
        icon={<DataObjectOutlined />}
        title="Machine Language (Author your machines)"
      />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Define multi-tape Turing machines for visualization, execution, configuration
        graph, and computation tree. The editor validates the TuringViz DSL directly
        and reports syntax or semantic diagnostics inline.
      </Typography>

      <Accordion
        defaultExpanded
        sx={{ borderRadius: 2, '&::before': { display: 'none' } }}
        disableGutters
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Program Header
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <LanguageLegend
                title="Required declarations"
                items={[
                  {
                    k: 'tapes',
                    d: 'Integer 1…6 (number of tapes).',
                    ex: 'tapes: 2',
                  },
                  {
                    k: 'input',
                    d: 'Initial content; use | between tapes; omitted tapes start blank.',
                    ex: 'input: "1011" | "01"',
                  },
                  {
                    k: 'blank',
                    d: 'Single character for blank cells. Often a space " ".',
                    ex: 'blank: " "',
                  },
                  {
                    k: 'start',
                    d: 'Initial state name.',
                    ex: 'start: q0',
                  },
                  {
                    k: 'state',
                    d: 'Starts a state block. A state with no rules is halting.',
                    ex: 'state accept:',
                  },
                ]}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper
                variant="outlined"
                sx={{ p: 2, borderRadius: 2, height: '100%' }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Minimal Template
                </Typography>
                <CodeBlock
                  language="tvm"
                  code={`tapes: 1
input: ""
blank: " "
start: q0

state q0:
  on " " -> move S; goto accept;

state accept:
`}
                />
              </Paper>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      <Accordion
        sx={{ borderRadius: 2, mt: 1, '&::before': { display: 'none' } }}
        disableGutters
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Conditions → Actions
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Conditions
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  A condition describes symbols under the heads. For multiple tapes
                  use <strong>/</strong>. Use <code>*</code> as wildcard; bracket
                  groups for options.
                </Typography>
                <CodeBlock
                  language="tvm"
                  code={`-- 1 tape
on 0 -> move R;
on [0, 1] -> move R;
on " " -> move S;

-- 2 tapes
on 1/0 -> move L/S;
on */" " -> move S/R;
on [0/0, 1/1] -> move R/R;

-- 3 tapes
on 1/" "/0 -> move R/S/L;
`}
                />
                <Typography variant="caption" color="text.secondary">
                  Tip: quote whitespace and punctuation symbols such as <code>" "</code>
                  or <code>"("</code>.
                </Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Actions
                </Typography>
                <MachineActionsTabs value={actionTab} onChange={onActionTabChange} />
              </Paper>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      <Accordion
        sx={{ borderRadius: 2, mt: 1, '&::before': { display: 'none' } }}
        disableGutters
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Conventions & Tips
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Stack spacing={0.75}>
                <Bullet>
                  Quote symbols with spaces or punctuation (e.g. <code>" "</code>).
                </Bullet>
                <Bullet>
                  Use <strong>/</strong> to separate per-tape symbols and per-tape
                  movements.
                </Bullet>
                <Bullet>
                  Multi-tape <code>write</code> must have one segment per tape (use{' '}
                  <code>same</code> to leave unchanged).
                </Bullet>
                <Bullet>
                  Halting states are state blocks without transitions:{' '}
                  <code>state accept:</code>
                </Bullet>
                <Bullet>
                  Omitting <code>goto</code> keeps the transition in the current state.
                </Bullet>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <Paper
                variant="outlined"
                sx={{ p: 2, borderRadius: 2, height: '100%' }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Small Checklist
                </Typography>
                <Stack spacing={0.75}>
                  <Bullet>
                    Does <code>tapes</code> match your per-tape symbols and
                    movements?
                  </Bullet>
                  <Bullet>
                    Is the blank symbol consistent in conditions and writes?
                  </Bullet>
                  <Bullet>
                    Did you quote symbols like <code>" "</code> and <code>")"</code>?
                  </Bullet>
                  <Bullet>Leave halting state blocks empty.</Bullet>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}

function GistGuide() {
  const [gistInput, setGistInput] = useState('');
  const gistId = extractGistId(gistInput);
  const gistUrl = gistId
    ? `https://turingviz.org/?gist=${encodeURIComponent(gistId)}`
    : 'https://turingviz.org/?gist=YOUR_ID';

  return (
    <Box sx={{ mt: 3 }}>
      <SectionTitle
        icon={<GitHub />}
        title="Load from GitHub Gist"
        subtitle="Generate a shareable URL that preloads a gist in the editor."
      />
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack spacing={1.25}>
          <Typography variant="body2" color="text.secondary">
            Paste a gist id (or full gist URL) to generate the turingviz.org link.
          </Typography>
          <TextField
            label="Gist id"
            size="small"
            value={gistInput}
            onChange={(event) => setGistInput(event.target.value)}
            placeholder="2134789tghbsfnsgkhflrup9108u345i"
          />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Resulting URL
          </Typography>
          <CodeBlock language="text" code={gistUrl} />
          <Typography variant="caption" color="text.secondary">
            Optional: add <code>&amp;file=machine.tvm</code> to pick a specific file
            inside the gist.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}

function GithubDiscoverCta() {
  return (
    <Paper
      variant="outlined"
      sx={{
        mt: 3,
        p: { xs: 2, md: 2.5 },
        borderRadius: 2.5,
        position: 'relative',
        overflow: 'hidden',
        borderColor: (t) => alpha(t.palette.primary.main, 0.35),
        background: (t) =>
          `linear-gradient(125deg, ${alpha(t.palette.primary.main, 0.12)} 0%, ${
            t.palette.background.paper
          } 55%, ${alpha(t.palette.info.main, 0.1)} 100%)`,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: (t) =>
            `radial-gradient(circle at 12% -10%, ${alpha(
              t.palette.primary.main,
              0.18
            )} 0%, transparent 55%)`,
        }}
      />
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        sx={{ position: 'relative', zIndex: 1 }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            Explore the project source
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Star, follow updates, or contribute directly on GitHub.
          </Typography>
        </Box>
        <Button
          component="a"
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noreferrer"
          size="large"
          variant="contained"
          startIcon={<GitHub />}
          endIcon={<NorthEast />}
          sx={{
            px: 2.5,
            borderRadius: 999,
            textTransform: 'none',
            fontWeight: 700,
            boxShadow: (t) => `0 10px 24px ${alpha(t.palette.primary.main, 0.3)}`,
            position: 'relative',
            overflow: 'hidden',
            '&::after': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: '-40%',
              width: '32%',
              height: '100%',
              transform: 'skewX(-24deg)',
              background: (t) => alpha(t.palette.common.white, 0.33),
              transition: 'left 260ms ease',
            },
            '&:hover::after': {
              left: '120%',
            },
          }}
        >
          Discover on GitHub
        </Button>
      </Stack>
    </Paper>
  );
}

export default function SiteFooter({ activeTab }: { activeTab: AppTab }) {
  const [actionTab, setActionTab] = useState(0);
  const showMachineLanguage = activeTab === 'input';

  return (
    <Box
      component="footer"
      sx={{
        mt: 4,
        bgcolor: (t) =>
          t.palette.mode === 'light'
            ? t.palette.background.default
            : t.palette.background.paper,
      }}
    >
      <Container
        maxWidth="xl"
        sx={{ py: { xs: 3, md: 4 }, px: { xs: 1.5, sm: 2, lg: 3 } }}
      >
        <FooterIntro />
        <Divider sx={{ my: 2 }} />
        <TheoryGrid activeTab={activeTab} />
        {showMachineLanguage ? (
          <>
            <MachineLanguageSection
              actionTab={actionTab}
              onActionTabChange={setActionTab}
            />
            <GistGuide />
          </>
        ) : null}
        <GithubDiscoverCta />
      </Container>
    </Box>
  );
}
