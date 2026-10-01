"""Build the page.
  python3 src/build.py            -> public/index.html  (no payroll data; for Vercel / the public repo)
  python3 src/build.py --offline  -> private/NIET_Payroll_offline.html (templates embedded; keep private)
Templates are read from private/ (git-ignored)."""
import base64, pathlib, sys
S = pathlib.Path(__file__).parent; R = S.parent
h = (S / 'app.src.html').read_text()
h = h.replace('/*JSZIP*/', (S / 'jszip.min.js').read_text().replace('</script', '<\\/script'), 1)
h = h.replace('/*ENGINE*/', (S / 'engine.js').read_text(), 1)
if '--offline' in sys.argv:
    P = R / 'private'
    h = h.replace('/*XLSX_B64*/', base64.b64encode((P / 'payroll_template.xlsx').read_bytes()).decode())
    h = h.replace('/*DOCX_B64*/', base64.b64encode((P / 'memo_template.docx').read_bytes()).decode())
    out = R / 'private' / 'NIET_Payroll_offline.html'
else:
    out = R / 'public' / 'index.html'
out.write_text(h)
print(out.relative_to(R), len(h), 'bytes')
