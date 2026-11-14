import struct,sys
def uleb(b,o):
    r=0;s=0
    while True:
        if o>=len(b): raise ValueError('eof')
        x=b[o];o+=1
        r|=(x&0x7f)<<s
        if x<0x80: return r,o
        s+=7
        if s>35: raise ValueError('leb')
def parse(path):
    b=open(path,'rb').read()
    n,off=struct.unpack_from('<II',b,0x38)
    S=[]
    for i in range(n):
        so=struct.unpack_from('<I',b,off+4*i)[0]
        p,l=uleb(b,so)
        S.append(b[p:p+l].decode('utf-8','replace'))
    tid_n,tid_off=struct.unpack_from('<II',b,0x40)
    types=[struct.unpack_from('<I',b,tid_off+4*i)[0] for i in range(tid_n)]
    cd_n,cd_off=struct.unpack_from('<II',b,0x60)
    cls=[S[types[struct.unpack_from('<I',b,cd_off+32*i)[0]]] for i in range(cd_n)]
    return S,cls
out=open('classes.txt','w')
for p in sys.argv[1:]:
    S,cls=parse(p)
    out.write(f"### {p} classes={len(cls)} strings={len(S)}\n")
    out.write('\n'.join(cls)+'\n')
    out.flush()
    print(p,len(cls),len(S),flush=True)
out.close()
