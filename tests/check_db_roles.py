#!/usr/bin/env python3
"""Executes the real role provisioner only inside a newly owned disposable container."""
import importlib.util
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
IMAGE='postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'

def main():
    name='roomie-roles-qa-'+secrets.token_hex(4)
    original_run=subprocess.run
    def docker(*args,**kw):return original_run(['docker',*args],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kw)
    docker('run','--detach','--name',name,'--network','none','--env','POSTGRES_USER=room_rental','--env','POSTGRES_DB=room_rental','--env','POSTGRES_PASSWORD='+('a'*64),IMAGE)
    try:
        for _ in range(80):
            if original_run(['docker','exec',name,'pg_isready','-U','room_rental'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
            time.sleep(.2)
        def sql(user,statement,check=True):
            return original_run(['docker','exec','-i',name,'psql','-X','-At','-q','-v','ON_ERROR_STOP=1','-U',user,'-d','room_rental'],input=statement,text=True,check=check,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        sql('room_rental','CREATE TABLE "Users" (id int PRIMARY KEY); CREATE TABLE "__EFMigrationsHistory" (id int);')
        spec=importlib.util.spec_from_file_location('db_roles',ROOT/'deploy/rehouse-db-roles.py');roles=importlib.util.module_from_spec(spec);spec.loader.exec_module(roles)
        with tempfile.TemporaryDirectory(prefix='roomie-role-config-') as folder:
            temp=Path(folder);(temp/'runtime.env').write_text('DB_PASSWORD='+('a'*64)+'\n')
            def private_path(value):return temp/Path(value).name
            def isolated_run(cmd,**kwargs):
                if cmd[:2]!=['docker','compose']:raise RuntimeError('Unexpected command')
                return original_run(['docker','exec','-i',name,*cmd[cmd.index('psql'):]],**kwargs)
            with patch.object(roles,'Path',side_effect=private_path),patch.object(roles.os,'geteuid',return_value=0),patch.object(roles.sys,'argv',['roles','fixture-image']),patch.object(roles.subprocess,'run',side_effect=isolated_run):
                roles.main();roles.main()
        assert sql('roomie_app','INSERT INTO "Users" VALUES (1); SELECT * FROM "Users";').returncode==0
        assert sql('roomie_app','CREATE TABLE forbidden(id int);',check=False).returncode!=0
        assert sql('roomie_app','DELETE FROM "__EFMigrationsHistory";',check=False).returncode!=0
        assert sql('room_rental','CREATE TABLE migration_allowed(id int);').returncode==0
        flags=sql('roomie_dba',"SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname IN ('roomie_app','room_rental')").stdout
        rows=[line.split('|') for line in flags.splitlines() if line.strip()]
        assert len(rows)==2 and all(row[1:]==['f','f','f'] for row in rows), 'Migration/runtime must have no cluster-wide role privileges'
        print('PASS: real role script rerun; runtime DML; DDL/history writes denied; migration DDL allowed')
    finally:
        docker('rm','--force','--volumes',name)
if __name__=='__main__':main()
