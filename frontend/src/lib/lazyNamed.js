import { lazy } from 'react';

/** React.lazy for a named export — lazyNamed(() => import('./vendor/Leads'), 'LeadsView') — so a page file can keep
    exporting by name and still be downloaded only when it is opened. */
export const lazyNamed = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
