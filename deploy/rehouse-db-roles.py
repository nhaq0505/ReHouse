#!/usr/bin/env python3
"""Root-only role provisioning; secrets stay in root0600 files and psql stdin."""
import os
from pathlib import Path
import secrets
import subprocess
import sys

def read_env(path):
    return dict(line.split('=', 1) for line in path.read_text().splitlines() if '=' in line and not line.lstrip().startswith('#'))
def main():
    if os.geteuid() != 0: raise RuntimeError('root required')
    envpath = Path('/etc/rehouse/runtime.env')
    env = read_env(envpath)
    adminpath = Path('/etc/rehouse/database-admin.env')
    admin_exists = adminpath.exists()
    admin_password = read_env(adminpath)['DB_ADMIN_PASSWORD'] if admin_exists else secrets.token_hex(32)
    runtime_password = env.get('APP_DB_PASSWORD') or secrets.token_hex(32)
    # Values generated here are hex. Reject unexpected input instead of shell interpolation.
    if not all(v and len(v) <= 256 and all(c.isalnum() for c in v) for v in [admin_password, runtime_password]):
        raise RuntimeError('unexpected credential format')
    image = sys.argv[1] if len(sys.argv) == 2 else Path('/var/lib/rehouse/current-image').read_text().strip()
    cmd = ['docker','compose','--env-file',str(envpath),'-f','/opt/rehouse/compose.yaml','exec','-T','db','psql','-X','-q','-v','ON_ERROR_STOP=1','-U','roomie_dba' if admin_exists else 'room_rental','-d','room_rental']
    migration_password = env['DB_PASSWORD']
    if not migration_password or any(c not in '0123456789abcdefABCDEF' for c in migration_password): raise RuntimeError('unexpected migration credential format')
    if not admin_exists:
        prepare = "DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='roomie_role_setup') THEN CREATE ROLE roomie_role_setup LOGIN SUPERUSER; END IF; END $$;"
        r = subprocess.run(cmd, input=prepare, text=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
            env={**os.environ,'IMAGE_REF':image,'APP_DB_PASSWORD':runtime_password}, timeout=60)
        if r.returncode: raise RuntimeError('role preparation failed')
        cmd[cmd.index('-U')+1] = 'roomie_role_setup'
    sql = f"""BEGIN;
DO $$ BEGIN
IF EXISTS(SELECT FROM pg_roles WHERE rolname='room_rental' AND oid=10) THEN ALTER ROLE room_rental RENAME TO roomie_dba; END IF;
IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='room_rental') THEN CREATE ROLE room_rental LOGIN; END IF;
IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='roomie_app') THEN CREATE ROLE roomie_app LOGIN; END IF;
END $$;
ALTER ROLE roomie_dba PASSWORD '{admin_password}';
ALTER ROLE room_rental PASSWORD '{migration_password}';
ALTER DATABASE room_rental OWNER TO room_rental;
DO $$ DECLARE r record; BEGIN
FOR r IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname='public' LOOP
EXECUTE format('ALTER TABLE %I.%I OWNER TO room_rental',r.schemaname,r.tablename);
END LOOP;
END $$;
ALTER ROLE roomie_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '{runtime_password}';
GRANT CONNECT ON DATABASE room_rental TO roomie_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO roomie_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO roomie_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO roomie_app;
ALTER DEFAULT PRIVILEGES FOR ROLE room_rental IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO roomie_app;
ALTER DEFAULT PRIVILEGES FOR ROLE room_rental IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO roomie_app;
DO $$ BEGIN IF to_regclass('public."__EFMigrationsHistory"') IS NOT NULL THEN
REVOKE INSERT,UPDATE,DELETE ON public."__EFMigrationsHistory" FROM roomie_app;
END IF; END $$;
ALTER ROLE room_rental NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
COMMIT;
"""
    completed = subprocess.run(cmd, input=sql, text=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        env={**os.environ,'IMAGE_REF':image,'APP_DB_PASSWORD':runtime_password}, timeout=60)
    if completed.returncode: raise RuntimeError('role provisioning failed; no credentials printed')
    if not admin_exists:
        cmd[cmd.index('-U')+1]='roomie_dba'
        subprocess.run(cmd,input='DROP ROLE IF EXISTS roomie_role_setup;',text=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,
            env={**os.environ,'IMAGE_REF':image,'APP_DB_PASSWORD':runtime_password},timeout=60,check=True)
        adminpath.write_text('DB_ADMIN_PASSWORD='+admin_password+'\n'); adminpath.chmod(0o600)
    if not env.get('APP_DB_PASSWORD'):
        with envpath.open('a') as f: f.write('\nAPP_DB_PASSWORD='+runtime_password+'\n')
    envpath.chmod(0o600)
    print('Database migration/runtime roles configured; credentials kept private.')
if __name__ == '__main__':
    try: main()
    except Exception:
        print('Database role setup failed; inspect local configuration.',file=sys.stderr); sys.exit(1)
