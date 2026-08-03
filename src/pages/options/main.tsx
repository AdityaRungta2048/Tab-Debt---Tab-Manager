import { render } from 'preact';
import '@/styles/tokens.css';
import { Options } from './Options';
import { applyStoredTheme } from '@/hooks/useTheme';

void applyStoredTheme();

const root = document.getElementById('root');
if (root) render(<Options />, root);
