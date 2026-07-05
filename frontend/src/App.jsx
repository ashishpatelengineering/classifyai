import { useRef, useState } from 'react';
import Hero from './components/Hero';
import Stepper from './components/Stepper';
import DataStep from './components/DataStep';
import CategoryEditor from './components/CategoryEditor';
import ResultsTable from './components/ResultsTable';
import { suggestCategories, assignCategories } from './api';
import './App.css';

export default function App() {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [categories, setCategories] = useState(null);
  const [result, setResult] = useState(null);
  const [critique, setCritique] = useState(false);
  const [refined, setRefined] = useState(false);

  const [suggestLoading, setSuggestLoading] = useState(false);
  const [regenerateLoading, setRegenerateLoading] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const [regenerateError, setRegenerateError] = useState('');
  const [assignError, setAssignError] = useState('');

  const setupRef = useRef(null);
  const editorRef = useRef(null);
  const resultsRef = useRef(null);

  const scrollTo = (ref) =>
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

  const currentStep = result ? 3 : categories ? 2 : 1;

  const handleReset = () => {
    setFile(null);
    setRows(null);
    setCategories(null);
    setResult(null);
    setSuggestError('');
    setRegenerateError('');
    setAssignError('');
    setRefined(false);
  };

  const handleStepClick = (step) => {
    if (step > currentStep) return;
    if (step === 1) scrollTo(setupRef);
    if (step === 2) scrollTo(editorRef);
    if (step === 3) scrollTo(resultsRef);
  };

  const handleAnalyze = async () => {
    setSuggestError('');
    setSuggestLoading(true);
    setResult(null);
    try {
      const data = await suggestCategories(file, { critique });
      setCategories(data.categories);
      setRefined(Boolean(data.refined));
      scrollTo(editorRef);
    } catch (err) {
      setSuggestError(err.message);
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerateError('');
    setRegenerateLoading(true);
    try {
      const data = await suggestCategories(file, { critique });
      setCategories(data.categories);
      setRefined(Boolean(data.refined));
    } catch (err) {
      setRegenerateError(err.message);
    } finally {
      setRegenerateLoading(false);
    }
  };

  const handleAssign = async () => {
    setAssignError('');
    setAssignLoading(true);
    try {
      const names = categories.map((c) => c.name);
      const data = await assignCategories(names, file);
      setResult(data);
      scrollTo(resultsRef);
    } catch (err) {
      setAssignError(err.message);
    } finally {
      setAssignLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <span className="topbar__brand">
            <span className="topbar__mark" aria-hidden="true" />
            ClassifyAI
          </span>
        </div>
      </header>

      <main>
        <Hero />

        <div className="workflow" ref={setupRef}>
          <Stepper current={currentStep} onStepClick={handleStepClick} />

          <DataStep
            file={file}
            setFile={setFile}
            rows={rows}
            setRows={setRows}
            onAnalyze={handleAnalyze}
            onReset={handleReset}
            loading={suggestLoading}
            error={suggestError}
          />

          {categories && (
            <div ref={editorRef}>
              <CategoryEditor
                categories={categories}
                setCategories={setCategories}
                onAssign={handleAssign}
                loading={assignLoading}
                error={assignError}
                onRegenerate={handleRegenerate}
                regenerateLoading={regenerateLoading}
                regenerateError={regenerateError}
                critique={critique}
                setCritique={setCritique}
                refined={refined}
              />
            </div>
          )}

          {result && (
            <div ref={resultsRef}>
              <ResultsTable
                result={result}
                categoryOptions={categories.map((c) => c.name)}
                originalFilename={file?.name}
              />
            </div>
          )}
        </div>
      </main>

      <footer className="footer">
        <p>Your file is read in memory and never saved. When you close the tab, it's gone — nothing lingers on our servers.</p>
      </footer>
    </div>
  );
}
