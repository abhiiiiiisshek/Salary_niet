# NIET Payroll

Generates the monthly **Payroll Excel** and the **Indian Bank Transfer Memo (Word)** from the approved August 2026 templates. Only the monthly values change. Fonts, borders, merged cells, print setup and the letter layout stay exactly as approved.

> **This repo must stay private.** The templates contain every employee's salary and bank account number.

## Monthly use

1. Open the site and sign in.
2. Pick the salary month. Days in the month, the "paid in" month and the default cheque date fill in automatically.
3. Enter C/L, M/L & E/L and **leave without pay** for anyone who took leave. Only leave without pay reduces salary.
4. Check the table, tick the box, and click **Generate payroll and memo**. You get `Payroll_<Month>_<Year>.xlsx` and `Transfer_Memo_<Month>_<Year>.docx`.

The files are built in the browser. Nothing is uploaded or stored on the server.

## Calculation (mirrors the approved sheet)

| | |
|---|---|
| Salary cut | Salary ÷ days in month × leave without pay (Principal: BP + GP + DA; HRA is not cut) |
| ESI | 0.75% of payable salary, only for employees whose row in the template has the ESI formula |
| Net payable | `ROUND(payable − ESI, 0)` per employee, nearest rupee |
| Total | sum of the rounded net amounts, so Excel, memo and words always match |

## Deploy on Vercel

1. vercel.com → **Add New → Project** → import `niet-payroll` from GitHub.
2. Framework preset: **Other**. Leave the build settings alone (`vercel.json` handles them).
3. **Settings → Environment Variables**: add `PAYROLL_USER` and `PAYROLL_PASSWORD` (Production, Preview, Development).
4. Redeploy. Until both variables are set, the site refuses every visitor (it fails closed).

## Changing employees or salaries

Names, salaries and bank accounts are read from `src/payroll_template.xlsx` and `src/memo_template.docx`. To change them, edit the templates (keep the `{{TOKENS}}` in the memo), run `python3 src/build.py`, then `npm test` and commit. The regression test must still pass for August 2026 unless salaries changed.

## Layout

```
public/index.html       the built single-page app (what Vercel serves)
middleware.ts           password gate for every request
src/engine.js           calendar, payroll formulas, rounding, words, Excel/Word patching
src/app.src.html        UI source
src/*_template.*        approved templates with monthly fields tokenised
src/build.py            bundles src/ into public/index.html
test/regression.cjs     August 2026 must equal ₹2,49,199
```
