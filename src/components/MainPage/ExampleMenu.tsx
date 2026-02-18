// src/components/MainPage/ExampleMenu.tsx
import { useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import InputIcon from '@mui/icons-material/Input';

import { ExampleTMs } from '@utils/ExampleTMs';
import { useEditorZustand } from '@zustands/EditorZustand';
import { useGraphZustand } from '@zustands/GraphZustand';
import { DEFAULT_TREE_DEPTH } from '@utils/constants';

export default function ExampleMenu() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const close = () => setAnchorEl(null);
  const { setCode } = useEditorZustand();

  // Graph Zustand setters
  const setComputationTreeDepth = useGraphZustand((s) => s.setComputationTreeDepth);

  const sendToState = (index: number): void => {
    close(); // close immediately for snappier UI

    const run = () => {
      setCode(ExampleTMs[index].code, true);
      setComputationTreeDepth(DEFAULT_TREE_DEPTH);
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  };

  return (
    <>
      <Tooltip title="Load Example">
        <Button
          color="inherit"
          size="medium"
          startIcon={<MenuBookIcon fontSize="small" />}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            ml: 1,
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
          Load Examples
        </Button>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {ExampleTMs.map((tm, idx) => (
          <MenuItem key={tm.name} onClick={() => sendToState(idx)}>
            <ListItemIcon>
              <InputIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={tm.name} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
