import { useMemo, useState } from 'react';

function toCsv(columns, rows) {
  const escape = (val) => {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(escape).join(',')];
  rows.forEach((row) => lines.push(row.map(escape).join(',')));
  return lines.join('\n');
}

const CONF_ORDER = { High: 0, Medium: 1, Low: 2 };

export default function ResultsTable({ result, categoryOptions, originalFilename }) {
  const [filter, setFilter] = useState('All');
  const [rows, setRows] = useState(result.rows);
  const [original] = useState(() => result.rows.map((r) => [...r]));
  const [search, setSearch] = useState('');
  const [bulkTarget, setBulkTarget] = useState('');

  const categoryIndex = result.columns.indexOf('Category');
  const confidenceIndex = result.columns.indexOf('Confidence');
  const reasonIndex = result.columns.indexOf('Reason');
  // Reason is shown inline under the category, not as its own wide column.
  const visibleColumns = result.columns.filter(
    (c) => c !== 'Confidence' && c !== 'Reason'
  );

  const counts = useMemo(() => {
    const map = {};
    rows.forEach((row) => {
      const cat = row[categoryIndex] ?? 'Unknown';
      map[cat] = (map[cat] || 0) + 1;
    });
    return map;
  }, [rows, categoryIndex]);

  // Per-category confidence breakdown for the sidebar bars.
  const confByCategory = useMemo(() => {
    const map = {};
    rows.forEach((row) => {
      const cat = row[categoryIndex] ?? 'Unknown';
      const conf = confidenceIndex === -1 ? 'Medium' : row[confidenceIndex];
      map[cat] = map[cat] || { High: 0, Medium: 0, Low: 0 };
      if (map[cat][conf] !== undefined) map[cat][conf] += 1;
    });
    return map;
  }, [rows, categoryIndex, confidenceIndex]);

  const categories = Object.keys(counts).sort();

  const lowIndexes = useMemo(
    () =>
      confidenceIndex === -1
        ? []
        : rows.map((r, i) => i).filter((i) => rows[i][confidenceIndex] === 'Low'),
    [rows, confidenceIndex]
  );
  const needsReviewCount = lowIndexes.length;

  const matchesSearch = (row) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return row.some((cell) => String(cell ?? '').toLowerCase().includes(q));
  };

  const filteredIndexes = rows
    .map((row, i) => i)
    .filter((i) => {
      if (!matchesSearch(rows[i])) return false;
      if (filter === 'All') return true;
      if (filter === 'Needs review') return rows[i][confidenceIndex] === 'Low';
      return rows[i][categoryIndex] === filter;
    });

  const updateCategory = (rowIndex, newCategory) => {
    setRows((prev) => {
      const next = prev.map((r) => [...r]);
      next[rowIndex][categoryIndex] = newCategory;
      if (newCategory === original[rowIndex][categoryIndex]) {
        // Reselecting the model's original category fully restores its call.
        if (confidenceIndex !== -1) next[rowIndex][confidenceIndex] = original[rowIndex][confidenceIndex];
        if (reasonIndex !== -1) next[rowIndex][reasonIndex] = original[rowIndex][reasonIndex];
      } else {
        // A human override is authoritative: mark it High and note the change.
        if (confidenceIndex !== -1) next[rowIndex][confidenceIndex] = 'High';
        if (reasonIndex !== -1) next[rowIndex][reasonIndex] = 'You set this one';
      }
      return next;
    });
  };

  const applyBulk = () => {
    if (!bulkTarget) return;
    const target = new Set(filteredIndexes);
    setRows((prev) =>
      prev.map((r, i) => {
        if (!target.has(i)) return r;
        const next = [...r];
        next[categoryIndex] = bulkTarget;
        if (bulkTarget === original[i][categoryIndex]) {
          if (confidenceIndex !== -1) next[confidenceIndex] = original[i][confidenceIndex];
          if (reasonIndex !== -1) next[reasonIndex] = original[i][reasonIndex];
        } else {
          if (confidenceIndex !== -1) next[confidenceIndex] = 'High';
          if (reasonIndex !== -1) next[reasonIndex] = 'You set these';
        }
        return next;
      })
    );
    setBulkTarget('');
  };

  const editedCount = useMemo(
    () =>
      rows.reduce(
        (n, r, i) => n + (r[categoryIndex] !== original[i][categoryIndex] ? 1 : 0),
        0
      ),
    [rows, original, categoryIndex]
  );

  const downloadCsv = () => {
    const csv = toCsv(result.columns, rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `categorized_${originalFilename || 'data.csv'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel">
      <div className="panel__head panel__head--row">
        <div>
          <h2 className="panel__title">Your categorized data</h2>
          <p className="panel__sub">
            {rows.length} rows in {categories.length} categories
            {editedCount > 0 && ` · you refined ${editedCount}`}.
            Every call comes with a reason — change any you disagree with.
          </p>
        </div>
        <button className="btn btn--primary" onClick={downloadCsv}>
          Download the file
        </button>
      </div>

      {result.incomplete_count > 0 && (
        <div className="alert alert--error">
          A few rows ({result.incomplete_count}) didn't get a confident call
          this time. They're waiting for you under “Needs review” — a quick look
          and you're done.
        </div>
      )}

      <div className="results-toolbar">
        <input
          className="field__input results-search"
          placeholder="Find a row…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filter !== 'All' && filteredIndexes.length > 0 && (
          <div className="bulk-relabel">
            <span className="bulk-relabel__label">
              Relabel {filteredIndexes.length} shown row(s) as
            </span>
            <select
              className="category-select"
              value={bulkTarget}
              onChange={(e) => setBulkTarget(e.target.value)}
            >
              <option value="">Choose…</option>
              {categoryOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <button
              className="btn btn--secondary"
              onClick={applyBulk}
              disabled={!bulkTarget}
            >
              Apply
            </button>
          </div>
        )}
      </div>

      <div className="results-layout">
        <ul className="filter-list">
          <li>
            <button
              className={`filter-list__item ${filter === 'All' ? 'filter-list__item--active' : ''}`}
              onClick={() => setFilter('All')}
            >
              <span>All</span>
              <span className="filter-list__count">{rows.length}</span>
            </button>
          </li>
          {needsReviewCount > 0 && (
            <li>
              <button
                className={`filter-list__item filter-list__item--review ${filter === 'Needs review' ? 'filter-list__item--active' : ''}`}
                onClick={() => setFilter('Needs review')}
              >
                <span>Needs review</span>
                <span className="filter-list__count">{needsReviewCount}</span>
              </button>
            </li>
          )}
          {categories.map((cat) => {
            const c = confByCategory[cat] || { High: 0, Medium: 0, Low: 0 };
            const total = counts[cat] || 1;
            return (
              <li key={cat}>
                <button
                  className={`filter-list__item ${filter === cat ? 'filter-list__item--active' : ''}`}
                  onClick={() => setFilter(cat)}
                >
                  <span>{cat}</span>
                  <span className="filter-list__count">{counts[cat]}</span>
                </button>
                <div className="conf-bar" title={`High ${c.High} · Medium ${c.Medium} · Low ${c.Low}`}>
                  <span className="conf-bar__seg conf-bar__seg--high" style={{ width: `${(c.High / total) * 100}%` }} />
                  <span className="conf-bar__seg conf-bar__seg--med" style={{ width: `${(c.Medium / total) * 100}%` }} />
                  <span className="conf-bar__seg conf-bar__seg--low" style={{ width: `${(c.Low / total) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredIndexes.slice(0, 200).map((rowIndex) => {
                const isEdited = rows[rowIndex][categoryIndex] !== original[rowIndex][categoryIndex];
                const confidence = confidenceIndex === -1 ? null : rows[rowIndex][confidenceIndex];
                const reason = reasonIndex === -1 ? '' : rows[rowIndex][reasonIndex];
                return (
                  <tr key={rowIndex}>
                    {visibleColumns.map((col) => {
                      const j = result.columns.indexOf(col);
                      const cell = rows[rowIndex][j];
                      if (j !== categoryIndex) {
                        return <td key={col}>{String(cell ?? '')}</td>;
                      }
                      return (
                        <td key={col}>
                          <span className="category-cell">
                            <select
                              className={`category-select ${isEdited ? 'category-select--edited' : ''}`}
                              value={cell}
                              onChange={(e) => updateCategory(rowIndex, e.target.value)}
                            >
                              {categoryOptions.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                            {confidence === 'Low' && !isEdited && (
                              <span className="confidence-dot confidence-dot--low" title="ClassifyAI wasn't sure — worth a look" />
                            )}
                          </span>
                          {reason && (
                            <span className={`category-reason ${confidence === 'Low' ? 'category-reason--low' : ''}`}>
                              {reason}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredIndexes.length > 200 && (
            <p className="table-wrap__note">
              Showing first 200 of {filteredIndexes.length} rows. Export the CSV for the full set.
            </p>
          )}
          {filteredIndexes.length === 0 && (
            <p className="table-wrap__note">No rows match this view.</p>
          )}
        </div>
      </div>
    </section>
  );
}
