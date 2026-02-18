import { useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import InputIcon from '@mui/icons-material/Input';

import { useEditorZustand } from '@zustands/EditorZustand';

function formatLoadedAt(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return '';
  }
}

export default function RecentMachinesMenu() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const close = () => setAnchorEl(null);

  const recentMachines = useEditorZustand((s) => s.recentMachines);
  const setCode = useEditorZustand((s) => s.setCode);

  const restoreRecent = (code: string) => {
    close();

    const run = () => {
      setCode(code, true, false);
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  };

  return (
    <>
      <Tooltip title="Load Recent Machine">
        <Button
          color="inherit"
          size="medium"
          startIcon={<HistoryIcon fontSize="small" />}
          onClick={(event) => setAnchorEl(event.currentTarget)}
          sx={{
            px: 1.75,
            py: 0.75,
            minWidth: 0,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '1rem',
            '& .MuiButton-startIcon': {
              mr: 1,
            },
            '& .MuiButton-startIcon .MuiSvgIcon-root': {
              fontSize: 22,
            },
          }}
        >
          Recent
        </Button>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: { xs: 'min(92vw, 380px)', sm: 380 },
              maxHeight: 420,
            },
          },
        }}
      >
        {recentMachines.length === 0 ? (
          <MenuItem disabled>
            <ListItemText
              primary="No recent machines yet"
              secondary="Use Load Machine to store the current YAML"
            />
          </MenuItem>
        ) : (
          recentMachines.map((machine) => (
            <MenuItem key={machine.id} onClick={() => restoreRecent(machine.code)}>
              <ListItemIcon>
                <InputIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                sx={{ minWidth: 0 }}
                primary={machine.label}
                secondary={formatLoadedAt(machine.loadedAt)}
                primaryTypographyProps={{
                  noWrap: true,
                  sx: {
                    overflow: 'hidden',
                    textOverflow: 'clip',
                    maskImage: 'linear-gradient(to right, black 82%, transparent 100%)',
                    WebkitMaskImage:
                      'linear-gradient(to right, black 82%, transparent 100%)',
                  },
                }}
                secondaryTypographyProps={{
                  noWrap: true,
                }}
              />
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
}
