"""page.html(아티팩트용 본문 조각) → 로컬에서 바로 열 수 있는 완전한 index.html 로 감싼다."""
import sys
frag = open(sys.argv[1], encoding="utf-8").read()
head = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<style>[hidden]{display:none!important}</style>
"""
tail = """
</body>
</html>
"""
# <title>, <meta>, <link>, <style> 은 head 로, 나머지는 body 로
cut = frag.index("</style>") + len("</style>")
open(sys.argv[2], "w", encoding="utf-8").write(head + frag[:cut] + "\n</head>\n<body>\n" + frag[cut:] + tail)
print("ok", len(frag))
