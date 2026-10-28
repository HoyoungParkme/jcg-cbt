def func(value):
    if type(value) == type(100):
        return 100
    elif type(value) == type(""):
        return len(value)
    else:
        return 20

a = '100.0'
b = 100.0
c = (100, 200)

print(func(a) + func(b) + func(c))
