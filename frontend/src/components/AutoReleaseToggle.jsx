/**
 * 🔓 The Auto Release switch — the same control in Contract setup and on the contract preview (useAutoRelease holds
 * the setting). Each place styles it for where it sits, through `className`.
 */
export default function AutoReleaseToggle({ on, onChange, disabled = false, className }) {
  return (
    <label className={className} title="Skip the review step — contracts are approved as soon as they're built">
      <input type="checkbox" checked={on} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      🔓 Auto Release
    </label>
  );
}
