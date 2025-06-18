import { Plugin } from '../types';
import { javaScriptPlugin } from './javascript';
import { javaPlugin } from './java';

export const builtinPlugins: Plugin[] = [javaScriptPlugin, javaPlugin];
