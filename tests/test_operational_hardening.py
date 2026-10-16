"""Disposable-only regression for pagination, OTP/admin MFA and credential policy."""
import base64
import hashlib
import hmac
import struct
import time
import unittest
import uuid
from test_api_integration import ApiSession, ADMIN_EMAIL, ADMIN_PASSWORD, OWNER_PASSWORD

class OperationalHardeningTests(unittest.TestCase):
    def setUp(self):
        self.admin=ApiSession(); self.admin.ok('POST','/api/auth/login',{'email':ADMIN_EMAIL,'password':ADMIN_PASSWORD})
    def test_admin_pagination_and_validation(self):
        for i in range(3):
            ApiSession().ok('POST','/api/auth/register',{'email':f'page-{uuid.uuid4().hex}@example.invalid','name':'Pagination fixture','password':OWNER_PASSWORD,'phone':''})
        first=self.admin.ok('GET','/api/admin/owners?page=1&pageSize=1')
        second=self.admin.ok('GET','/api/admin/owners?page=2&pageSize=1')
        self.assertEqual(len(first['items']),1); self.assertNotEqual(first['items'][0]['id'],second['items'][0]['id'])
        self.assertGreaterEqual(first['total'],3)
        self.assertEqual(self.admin.request('GET','/api/admin/owners?page=0')[0],400)
        self.assertEqual(self.admin.request('GET','/api/admin/owners?pageSize=101')[0],400)
    def test_register_rejects_weak_password(self):
        for password in ['abcdefgh','longlowercasepassword']:
            status,_,_=ApiSession().request('POST','/api/auth/register',{'email':f'weak-{uuid.uuid4().hex}@example.invalid','name':'Weak fixture','password':password,'phone':''})
            self.assertEqual(status,400)
    def test_mfa_enrollment_login_replay_and_recovery(self):
        # Admin fixture is shared: enroll last, then explicitly reset only its synthetic SQLite row.
        import os,sqlite3
        path=os.environ.get('TEST_SQLITE_DB')
        if not path: self.skipTest('MFA enrollment mutation requires the disposable SQLite fixture')
        try:
            setup=self.admin.ok('POST','/api/auth/mfa/setup',{'currentPassword':ADMIN_PASSWORD})
            key=base64.b32decode(setup['secret'])
            def code(step):
                value=hmac.new(key,struct.pack('>Q',step),hashlib.sha1).digest(); offset=value[-1]&15
                return str((struct.unpack('>I',value[offset:offset+4])[0]&0x7fffffff)%1000000).zfill(6)
            step=int(time.time())//30
            result=self.admin.ok('POST','/api/auth/mfa/confirm',{'code':code(step)})
            self.assertEqual(len(result['recoveryCodes']),8)
            self.assertEqual(self.admin.request('GET','/api/auth/me')[0],401)
            login={'email':ADMIN_EMAIL,'password':ADMIN_PASSWORD}
            self.assertEqual(ApiSession().request('POST','/api/auth/login',login)[0],401)
            self.assertEqual(ApiSession().request('POST','/api/auth/login',{**login,'code':code(step)})[0],401)
            ApiSession().ok('POST','/api/auth/login',{**login,'code':code(step+1)})
            self.assertEqual(ApiSession().request('POST','/api/auth/login',{**login,'code':code(step+1)})[0],401)
            ApiSession().ok('POST','/api/auth/login',{**login,'code':result['recoveryCodes'][0]})
            self.assertEqual(ApiSession().request('POST','/api/auth/login',{**login,'code':result['recoveryCodes'][0]})[0],401)
        finally:
            with sqlite3.connect(path) as db:
                db.execute('UPDATE Users SET MfaEnabled=0,ProtectedMfaSecret=NULL,PendingMfaSecret=NULL,MfaRecoveryHashes=NULL,MfaLastStep=-1 WHERE Email=?',(ADMIN_EMAIL,))
