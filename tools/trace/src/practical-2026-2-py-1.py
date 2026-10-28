class LocationDict:
    locations = {
        "NYC": "New York",
        "LON": "London",
        "PAR": "Paris",
        "TKY": "Tokyo"
    }

tmpdict = LocationDict()
str01 = ""
for key, location in tmpdict.locations.items():
    keyk = key[-1]
    locationk = location[0]
    str01 += keyk + locationk

print(str01, end="")
