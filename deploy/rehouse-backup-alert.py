#!/usr/bin/env python3
"""Send bounded backup failure/staleness alerts; never include secrets or child logs."""
import email.message
import os
from pathlib import Path
import shlex
import smtplib
import ssl
import sys
import time

def config():
    result = {}
    for filename in ['/etc/rehouse/runtime.env', '/etc/rehouse/backup.env']:
        p = Path(filename)
        if not p.exists(): continue
        for line in p.read_text().splitlines():
            if not line.strip() or line.lstrip().startswith('#') or '=' not in line: continue
            key, value = line.split('=', 1)
            if key.startswith('SMTP_') or key == 'BACKUP_ALERT_TO':
                parts = shlex.split(value)
                result[key] = parts[0] if len(parts) == 1 else value
    return result

def main():
    if os.geteuid() != 0: raise SystemExit('Root required')
    now = time.time()
    success = Path('/var/lib/rehouse/backup-last-success')
    if sys.argv[-1] == 'stale' and success.exists() and now - success.stat().st_mtime < 27 * 3600: return
    marker = Path('/var/lib/rehouse/backup-last-alert')
    if marker.exists() and now - marker.stat().st_mtime < 3600: return
    c = config()
    if not c.get('BACKUP_ALERT_TO'): raise SystemExit('Backup alert recipient is not configured')
    msg = email.message.EmailMessage()
    msg['From'] = c['SMTP_FROM_ADDRESS']; msg['To'] = c['BACKUP_ALERT_TO']
    msg['Subject'] = '[Roomie] Backup requires attention'
    msg.set_content('Backup failed or no successful backup has completed in27hours. Inspect rehouse-backup.service and the last verified Drive snapshot. This message contains no backup data or credentials.')
    security = c.get('SMTP_SECURITY', 'StartTls')
    if security not in {'StartTls', 'SslOnConnect'}: raise SystemExit('TLS is required')
    cls = smtplib.SMTP_SSL if security == 'SslOnConnect' else smtplib.SMTP
    with cls(c['SMTP_HOST'], int(c.get('SMTP_PORT', '587')), timeout=15) as client:
        if security == 'StartTls': client.starttls(context=ssl.create_default_context())
        if c.get('SMTP_USERNAME'): client.login(c['SMTP_USERNAME'], c['SMTP_PASSWORD'])
        client.send_message(msg)
    marker.touch(mode=0o600)

if __name__ == '__main__':
    try: main()
    except Exception:
        print('Backup alert delivery failed; inspect configuration locally.', file=sys.stderr)
        sys.exit(1)
