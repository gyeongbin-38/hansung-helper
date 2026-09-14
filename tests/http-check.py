import urllib.request,urllib.error,json
base='http://127.0.0.1:8787'
def check(path,method,headers=None,data=None,attempt=0):
 req=urllib.request.Request(base+path,method=method,headers=headers or {},data=data)
 try:
  with urllib.request.urlopen(req) as r:return r.status,r.headers
 except urllib.error.HTTPError as e:
  body=e.read();e.close()
  if e.code==503 and b'worker restarted mid-request' in body and attempt<3:
   return check(path,method,headers,data,attempt+1)
  return e.code,e.headers
assert check('/','GET')[0]==200
status,headers=check('/api/account','GET');assert status==401 and 'no-store' in headers['Cache-Control']
assert check('/api/account/profile','PUT',{'Origin':base,'Content-Type':'application/json'},b'{}')[0]==401
assert check('/api/account/login','POST',{'Origin':'https://other.example','Content-Type':'application/json'},b'{}')[0]==403
assert check('/api/account/login','POST',{'Origin':base,'Content-Type':'application/json'},b'{}')[0]==400
assert check('/api/account','DELETE',{'Origin':base,'Content-Type':'application/json'},b'{}')[0]==401
print('PASS: HTTP homepage, private no-cache API, unauthenticated read/write/delete rejection, cross-origin login rejection, invalid login validation')
