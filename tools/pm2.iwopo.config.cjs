/**
 * 🧭 How PM2 runs iwopo on this server (audit 2026-11-14) — start or re-create with:
 *     pm2 start /var/www/iwopo/tools/pm2.iwopo.config.cjs --only iwopo-api        (live)
 *     pm2 start /var/www/iwopo/tools/pm2.iwopo.config.cjs --only iwopo-staging-api (staging)
 *     pm2 save
 * The apps run as the unprivileged `iwopo` user (tools/iwopo-server-user.sh creates it), never as root: a fault in
 * the app can then only reach what that user may touch — its storage, uploads and FTP folders.
 * `pm2 restart <name>` (iwopo-deploy) keeps the user. Logs stay in /root/.pm2/logs, written by PM2 itself.
 */
const app = (name, dir) => ({
  name,
  script: 'src/server.js',
  cwd: `${dir}/backend`,
  exec_mode: 'fork',
  uid: 'iwopo',
  gid: 'iwopo',
  env: { HOME: '/var/lib/iwopo', PLAYWRIGHT_BROWSERS_PATH: '/opt/ms-playwright' },   // the PDF browser, shared (lib/pdf.js)
});

module.exports = {
  apps: [
    app('iwopo-api', '/var/www/iwopo'),
    app('iwopo-staging-api', '/var/www/iwopo-staging'),
  ],
};
