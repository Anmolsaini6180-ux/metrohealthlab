interface Props {
  steps: readonly string[];
  labels: Record<string, string>;
  activeIndex: number;
}

// Numbered-circle progress bar matching the reference's booking
// stepper (1 Select → 2 Address → 3 Payment → 4 Confirm). Purely
// presentational — BookingFlowPage still owns stepIndex/canGoNext, this
// just renders where the customer currently is.
export default function BookingStepper({ steps, labels, activeIndex }: Props) {
  return (
    <ol className="mh2-stepper" aria-label="Booking progress">
      {steps.map((key, i) => {
        const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "upcoming";
        return (
          <li key={key} className={`mh2-stepper__item is-${state}`}>
            <span className="mh2-stepper__dot" aria-hidden="true">
              {state === "done" ? <span className="mi">check</span> : i + 1}
            </span>
            <span className="mh2-stepper__label">{labels[key]}</span>
            {i < steps.length - 1 && <span className="mh2-stepper__line" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
