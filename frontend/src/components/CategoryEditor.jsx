import { useState } from 'react';

export default function CategoryEditor({
  categories,
  setCategories,
  onAssign,
  loading,
  error,
  onRegenerate,
  regenerateLoading,
  regenerateError,
  critique,
  setCritique,
  refined,
}) {
  const [draft, setDraft] = useState('');
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');

  const addCategory = () => {
    const value = draft.trim();
    if (!value || categories.some((c) => c.name === value)) return;
    const newCategory = { name: value, description: 'Your category — rows you want grouped here' };
    const unknownIndex = categories.findIndex((c) => c.name === 'Unknown');
    if (unknownIndex === -1) {
      setCategories([...categories, newCategory]);
    } else {
      const next = [...categories];
      next.splice(unknownIndex, 0, newCategory);
      setCategories(next);
    }
    setDraft('');
  };

  const removeCategory = (name) => {
    if (name === 'Unknown') return;
    setCategories(categories.filter((c) => c.name !== name));
  };

  const startRename = (index, currentName) => {
    if (currentName === 'Unknown') return;
    setEditingIndex(index);
    setEditValue(currentName);
    setEditError('');
  };

  const cancelRename = () => {
    setEditingIndex(-1);
    setEditValue('');
    setEditError('');
  };

  const commitRename = (index) => {
    const value = editValue.trim();
    const original = categories[index].name;
    if (!value) {
      setEditError('Name can’t be empty.');
      return;
    }
    if (value === original) {
      cancelRename();
      return;
    }
    if (categories.some((c, i) => i !== index && c.name.toLowerCase() === value.toLowerCase())) {
      setEditError('That name is already in use.');
      return;
    }
    setCategories(categories.map((c, i) => (i === index ? { ...c, name: value } : c)));
    cancelRename();
  };

  return (
    <section className="panel">
      <div className="panel__head panel__head--row">
        <div>
          <h2 className="panel__title">How your data gets categorized</h2>
          <p className="panel__sub">
            The categories ClassifyAI found in your data. Rename any category,
            remove ones you don't need, or add your own before running.
          </p>
        </div>
        <button
          className="btn btn--secondary"
          onClick={onRegenerate}
          disabled={regenerateLoading || loading}
        >
          {regenerateLoading ? 'Rethinking…' : 'Try different categories'}
        </button>
      </div>

      <label className="critique-toggle">
        <input
          type="checkbox"
          checked={critique}
          onChange={(e) => setCritique(e.target.checked)}
          disabled={regenerateLoading || loading}
        />
        <span>
          <span className="critique-toggle__label">Double-check these categories</span>
          <span className="critique-toggle__hint">
            Have ClassifyAI look again for overlaps or gaps before it runs — a
            little slower, noticeably sharper categories.
          </span>
        </span>
      </label>

      {refined && (
        <div className="alert alert--info">
          ClassifyAI tightened these up to fit your data more cleanly.
        </div>
      )}

      {regenerateError && <div className="alert alert--error">{regenerateError}</div>}

      <ul className="category-list">
        {categories.map((cat, index) => (
          <li key={index} className="category-list__item">
            <div className="category-list__text">
              {editingIndex === index ? (
                <div className="category-rename">
                  <input
                    className="field__input category-rename__input"
                    value={editValue}
                    autoFocus
                    onChange={(e) => {
                      setEditValue(e.target.value);
                      if (editError) setEditError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRename(index);
                      } else if (e.key === 'Escape') {
                        cancelRename();
                      }
                    }}
                    onBlur={() => commitRename(index)}
                    aria-label={`Rename ${cat.name}`}
                  />
                  {editError && <span className="category-rename__error">{editError}</span>}
                </div>
              ) : (
                <button
                  type="button"
                  className={`category-list__name ${cat.name === 'Unknown' ? 'category-list__name--locked' : ''}`}
                  onClick={() => startRename(index, cat.name)}
                  disabled={cat.name === 'Unknown'}
                  title={cat.name === 'Unknown' ? 'The catch-all category can’t be renamed' : 'Click to rename'}
                >
                  {cat.name}
                </button>
              )}
              {cat.description && editingIndex !== index && (
                <span className="category-list__desc">{cat.description}</span>
              )}
            </div>
            {cat.name !== 'Unknown' && editingIndex !== index && (
              <div className="category-list__actions">
                <button
                  className="category-list__action"
                  onClick={() => startRename(index, cat.name)}
                  aria-label={`Rename ${cat.name}`}
                >
                  Rename
                </button>
                <button
                  className="category-list__action category-list__action--danger"
                  onClick={() => removeCategory(cat.name)}
                  aria-label={`Remove ${cat.name}`}
                >
                  Remove
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="chip-add">
        <input
          className="field__input"
          placeholder="Add your own category"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
        />
        <button className="btn btn--secondary" onClick={addCategory} disabled={!draft.trim()}>
          Add
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <button
        className="btn btn--primary btn--full"
        onClick={onAssign}
        disabled={loading || regenerateLoading || categories.length < 2}
      >
        {loading ? 'Categorizing every row…' : 'Categorize my data'}
      </button>
    </section>
  );
}
