import { render } from 'preact';
import '@/styles/tokens.css';
import { Popup } from './Popup';
import { applyStoredTheme } from '@/hooks/useTheme';

void applyStoredTheme();

const root = document.getElementById('root');
if (root) render(<Popup />, root);
