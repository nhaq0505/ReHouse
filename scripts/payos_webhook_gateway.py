#!/usr/bin/env python3
"""Expose only one owner's payOS callback through a temporary HTTPS tunnel."""
import argparse
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from uuid import UUID


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--owner-id', required=True, type=UUID)
    parser.add_argument('--port', type=int, default=5081)
    args = parser.parse_args()
    callback = f'/api/payments/webhook/{args.owner_id}'

    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, body, content_type='application/json'):
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            self.reply(404, b'{"message":"Not found"}')

        def do_POST(self):
            if self.path != callback:
                return self.reply(404, b'{"message":"Not found"}')
            if self.headers.get('Transfer-Encoding'):
                return self.reply(400, b'{"message":"Content-Length required"}')
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                return self.reply(400, b'{"message":"Invalid Content-Length"}')
            if not 0 < length <= 65536:
                return self.reply(413, b'{"message":"Invalid body size"}')
            if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
                return self.reply(415, b'{"message":"JSON required"}')
            self.connection.settimeout(20)
            connection = http.client.HTTPConnection('127.0.0.1', 5080, timeout=20)
            try:
                payload = self.rfile.read(length)
                if len(payload) != length:
                    return self.reply(400, b'{"message":"Incomplete body"}')
                connection.request('POST', callback, body=payload,
                                   headers={'Content-Type': 'application/json'})
                response = connection.getresponse()
                self.reply(response.status, response.read(),
                           response.getheader('Content-Type', 'application/json'))
            except (OSError, http.client.HTTPException):
                self.reply(502, b'{"message":"Local API unavailable"}')
            finally:
                connection.close()

        def log_message(self, format, *values):
            # Never print callback bodies, credentials, or request headers.
            print(f'Webhook gateway: {self.command} completed', flush=True)

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Webhook gateway listening on 127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
