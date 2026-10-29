import urllib.request,urllib.error,json
base='http://127.0.0.1:8787'
import time
def check(path,method,headers=None,data=None,attempt=0):
 req=urllib.request.Request(base+path,method=method,headers=headers or {},data=data)
 try:
  with urllib.request.urlopen(req,timeout=20) as r:
   # Read before closing so the local Worker proxy can finish its response.
   r.read()
   return r.status,r.headers
 except urllib.error.HTTPError as e:
  body=e.read();e.close()
  # Retry only explicit local-runtime transport errors, never application 500s.
  transient=(e.code==503 and b'worker restarted mid-request' in body) or (
   e.code==500 and b'Network connection lost.' in body and b'node_modules/miniflare/' in body)
  if transient and attempt<3:
   print(f'Retrying local Worker transport error ({attempt+1}/3): {method} {path}')
   time.sleep(0.1)
   return check(path,method,headers,data,attempt+1)
  return e.code,e.headers
assert check('/','GET')[0]==200
status,headers=check('/api/account','GET');assert status==401 and 'no-store' in headers['Cache-Control']
assert check('/api/account/profile','PUT',{'Origin':base,'Content-Type':'application/json'},b'{}')[0]==401
assert check('/api/account/login','POST',{'Origin':'https://other.example','Content-Type':'application/json'},b'{}')[0]==403
assert check('/api/account/login','POST',{'Origin':base,'Content-Type':'application/json'},b'{}')[0]==400
assert check('/api/account','DELETE',{'Origin':base,'Content-Type':'application/json'},b'{}')[0]==401
print('PASS: HTTP homepage, private no-cache API, unauthenticated read/write/delete rejection, cross-origin login rejection, invalid login validation')
