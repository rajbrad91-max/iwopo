import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * 🔓 The account-wide Auto Release setting (vendor_settings.auto_release_contract). Off: the vendor reads each
 * contract and releases it. On: contracts are approved as soon as they are built. Read once; save() writes this
 * one setting (the server keeps the others) and puts the box back if the save fails. Contract setup and the
 * contract preview both use it, so the two can never disagree.
 */
export function useAutoRelease() {
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    api.mySettings()
      .then(s => { if (live) setOn(!!s?.settings?.auto_release_contract); })
      .catch(() => { /* stays off: the safe side, every contract waits for a release */ })
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  async function save(next) {
    setOn(next);                                         // the box answers at once
    try { await api.saveSettings({ auto_release_contract: next }); }
    catch (e) { setOn(!next); throw e; }
  }
  return { on, ready, save };
}
