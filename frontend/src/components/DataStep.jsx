import { useRef, useState } from 'react';
import Papa from 'papaparse';

const PREVIEW_LIMIT = 50;

export default function DataStep({ file, setFile, rows, setRows, onAnalyze, onReset, loading, error }) {
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState('');
  const fileInputRef = useRef(null);

  const loadFile = (candidate) => {
    if (!candidate || !candidate.name.endsWith('.csv')) return;
    setParseError('');
    setFile(candidate);
    Papa.parse(candidate, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (!result.data.length) {
          setParseError('This file has no rows.');
          setRows(null);
          return;
        }
        setRows({ columns: result.meta.fields, data: result.data });
      },
      error: () => setParseError('Could not read this file as CSV.'),
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    loadFile(e.dataTransfer.files?.[0]);
  };

  return (
    <section id="setup" className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Start with your data</h2>
      </div>

      {!rows ? (
        <div
          className={`dropzone ${dragOver ? 'dropzone--active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => loadFile(e.target.files?.[0] ?? null)}
            hidden
          />
          <span className="dropzone__cta">Drop your CSV here, or click to choose one</span>
          <span className="dropzone__meta">CSV, up to 15 MB · nothing is stored</span>
        </div>
      ) : (
        <>
          <div className="file-bar">
            <div>
              <span className="file-bar__name">{file.name}</span>
              <span className="file-bar__meta">{rows.data.length} rows &middot; {rows.columns.length} columns</span>
            </div>
            <button className="file-bar__replace" onClick={onReset}>
              Replace file
            </button>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {rows.columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.data.slice(0, PREVIEW_LIMIT).map((row, i) => (
                  <tr key={i}>
                    {rows.columns.map((col) => (
                      <td key={col}>{String(row[col] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.data.length > PREVIEW_LIMIT && (
              <p className="table-wrap__note">
                Previewing {PREVIEW_LIMIT} of {rows.data.length} rows — all {rows.data.length} will be categorized.
              </p>
            )}
          </div>
        </>
      )}

      {(parseError || error) && <div className="alert alert--error">{parseError || error}</div>}

      <button
        className="btn btn--primary btn--full"
        onClick={onAnalyze}
        disabled={loading || !rows}
      >
        {loading ? 'Reading your data…' : 'Find the categories'}
      </button>
    </section>
  );
}
