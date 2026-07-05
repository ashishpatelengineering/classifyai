const STEPS = [
  { n: 1, label: 'Data' },
  { n: 2, label: 'Categories' },
  { n: 3, label: 'Review' },
];

export default function Stepper({ current, onStepClick }) {
  return (
    <div className="stepper">
      {STEPS.map((step, i) => {
        const state = step.n < current ? 'done' : step.n === current ? 'active' : 'upcoming';
        const reachable = step.n <= current;
        return (
          <div className="stepper__segment" key={step.n}>
            <button
              className={`stepper__item stepper__item--${state}`}
              onClick={() => reachable && onStepClick?.(step.n)}
              disabled={!reachable}
              type="button"
            >
              <span className="stepper__marker">{state === 'done' ? '✓' : step.n}</span>
              <span className="stepper__label">{step.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`stepper__divider ${step.n < current ? 'stepper__divider--done' : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
