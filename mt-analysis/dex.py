import struct,sys
def uleb(b,o):
    r=0;s=0
    while True:
        x=b[o];o+=1
        r|=(x&0x7f)<<s
        if x<0x80: return r,o
        s+=7
def parse(b):
    S=[]
    n=struct.unpack_from('<I',b,0x38)[0]
    off=struct.unpack_from('<I',b,0x3c)[0]
    for i in range(n):
        so=struct.unpack_from('<I',b,off+4*i)[0]
        p,l=uleb(b,so)
        S.append(b[p:p+l].decode('utf-8','replace'))
    tid_off=struct.unpack_from('<I',b,0x44)[0]
    tid_n=struct.unpack_from('<I',b,0x40)[0]
    types=[struct.unpack_from('<I',b,tid_off+4*i)[0] for i in range(tid_n)]
    cd_off=struct.unpack_from('<I',b,0x64)[0]
    cd_n=struct.unpack_from('<I',b,0x60)[0]
    cls=[]
    for i in range(cd_n):
        ci=struct.unpack_from('<I',b,cd_off+32*i)[0]
        cls.append(S[types[ci]])
    return S,cls
for f in sys.argv[1:]:
    b=open(f,'rb').read()
    S,cls=parse(b)
    print(f"### {f}  classes={len(cls)}  strings={len(S)}")
    for x in cls: print(x)
