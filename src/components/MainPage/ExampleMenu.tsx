// src/components/MainPage/ExampleMenu.tsx
import { useState } from 'react';
import {
  IconButton,
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
        <IconButton
          color="inherit"
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ ml: 1, padding: 2 }}
        >
          <MenuBookIcon />
        </IconButton>
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
