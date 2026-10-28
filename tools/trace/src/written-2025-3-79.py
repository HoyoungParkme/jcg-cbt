strA = 'Information Technology'
strL = list()
for i in range(0, len(strA), 2):
    strL.append(strA[i])
for j in range(len(strL) - 1, 0, -2):
    print(strL[j], end='')
