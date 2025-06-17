import { Plugin } from '../types';
import { javaScriptPlugin } from './javascript';
import { javaPlugin } from './java';

export const defaultPlugins: Plugin[] = [javaScriptPlugin, javaPlugin];
