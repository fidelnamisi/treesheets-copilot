
import Store from 'electron-store';
import { AppStore } from '../src/shared/types.js';

export const store = new Store<AppStore>({
    defaults: {
        theme: 'dark'
    }
});
