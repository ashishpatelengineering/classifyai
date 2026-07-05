CATEGORY_SUGGESTION_PROMPT = """
Analyze the COMPLETE CSV dataset below. You are seeing every row at once on
purpose: infer categories that reflect the real, global structure of the data,
not just the first few rows.

Infer broad, meaningful, high-level semantic categories suitable for
classifying each row.

OUTPUT RULES:
1. Output exactly 6 lines.
2. The first 5 lines are categories. Each line must be formatted exactly as:
   Category Name | a plain-language description a non-expert instantly gets
3. The 6th line must be exactly:
   Unknown | Anything that doesn't clearly belong in the groups above
4. Use a single pipe character "|" to separate the name and description.
5. Descriptions: under 12 words, concrete, written for a busy person — say
   what actually lands here, not a dictionary definition. Prefer "Complaints
   about broken or faulty items" over "Rows pertaining to product defects."
6. No numbering, bullets, quotes, or markdown.
7. No repeated categories.
8. Categories must be broad, general, and reflect real patterns across the
   WHOLE dataset.
9. Return only the 6 lines described above, nothing else.

CSV DATA:
{csv_text}
"""

# Layer 2: a self-critique pass. The model reviews its own taxonomy against
# the whole dataset and repairs overlap, gaps, and vague boundaries.
CATEGORY_CRITIQUE_PROMPT = """
You previously proposed a category scheme for the COMPLETE CSV dataset below.
Now critically audit that scheme against the whole dataset before it is used
to classify every row.

CURRENT CATEGORIES:
{categories}

Check for these problems:
- Overlap: two categories that would compete for the same rows.
- Gaps: a clear cluster of rows that no category cleanly covers.
- Vagueness: a category so broad it tells the user nothing.
- Redundancy: near-duplicate categories that should be merged.

OUTPUT RULES:
1. Output the FINAL, corrected category scheme only.
2. Exactly 6 lines: 5 categories then the Unknown line.
3. Each category line: Category Name | plain-language description, under 12
   words, saying what actually lands here — not a dictionary definition.
4. The 6th line must be exactly:
   Unknown | Anything that doesn't clearly belong in the groups above
5. If the original scheme was already good, return it unchanged.
6. Single pipe "|" separator. No numbering, bullets, quotes, or markdown.
7. Return only the 6 lines, nothing else.

CSV DATA:
{csv_text}
"""

CATEGORY_ASSIGNMENT_PROMPT = """
Analyze the COMPLETE CSV dataset below, which has {row_count} data rows (not
counting the header). You are seeing all rows at once on purpose: use the full
dataset context so similar rows are labeled consistently.

For each data row, in the exact same top-to-bottom order as the input,
choose exactly one category from this list: {categories}.
Judge how confident you are, and give a brief reason.

OUTPUT RULES:
1. Output exactly {row_count} lines.
2. Each line must be formatted exactly as:
   Category|Confidence|Reason
3. Confidence must be exactly one of: High, Medium, Low.
4. Reason must be a short justification, 10 words or fewer, no pipe characters.
5. Use "Low" whenever the row is vague, ambiguous, or could plausibly fit
   more than one category. In that case name the competing category in the
   reason (e.g. "could also be Refund").
6. Line 1 is the result for data row 1, line 2 for data row 2, and so on.
7. Do NOT invent any category not in the list.
8. If a row does not clearly fit any category, use: Unknown|Low|<reason>
9. No row numbers, bullets, quotes, or markdown.
10. Do not skip rows and do not merge rows.

CSV DATA:
{csv_text}
"""

# Used only to complete an output that came back truncated, WITHOUT resending
# a fragmented view of the data as the source of truth. The full dataset is
# still included so the model keeps global context; we simply ask it to resume
# at a given row.
CATEGORY_ASSIGNMENT_RESUME_PROMPT = """
You are completing a classification that was cut off. The COMPLETE CSV dataset
is below ({row_count} data rows). You already produced labels for the first
{done_count} rows. Produce labels for the REMAINING rows only, starting at data
row {resume_at}, to the end.

Use the SAME category list: {categories}.

OUTPUT RULES:
1. Output exactly {remaining_count} lines (one per remaining row, in order).
2. Each line: Category|Confidence|Reason  (Confidence: High/Medium/Low;
   Reason: 10 words or fewer, no pipe characters).
3. Line 1 of your output is data row {resume_at}, and so on to the last row.
4. Do NOT repeat the rows you already labeled. Do NOT invent categories.
5. No row numbers, bullets, quotes, or markdown.

CSV DATA:
{csv_text}
"""
