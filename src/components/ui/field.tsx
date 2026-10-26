"use client";

import * as React from "react";
import { cn } from "cn";
import { ChevronDown, CircleAlert } from "lucide-react";

/*
 * Form fields as in the mockup: a label above, the control, then a hint or an error. A <Field>
 * wires its control for assistive technology: id, aria-describedby (hint or error) and
 * aria-invalid, so screen readers announce the error with the field.
 */

type FieldContextValue = { id: string; describedBy?: string; invalid: boolean };
const FieldContext = React.createContext<FieldContextValue | null>(null);

function useFieldControl(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
}) {
  const field = React.useContext(FieldContext);
  const describedBy = [props["aria-describedby"], field?.describedBy].filter(Boolean).join(" ");
  return {
    id: props.id ?? field?.id,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": props["aria-invalid"] ?? (field?.invalid ? true : undefined),
  };
}

type FieldProps = {
  label: React.ReactNode;
  /** Defaults to a generated id. */
  id?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  /** Visually hidden label, still read by screen readers. */
  hideLabel?: boolean;
  children: React.ReactNode;
};

function Field({ label, id, hint, error, className, hideLabel, children }: FieldProps) {
  const generated = React.useId();
  const controlId = id ?? `field${generated}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const value = React.useMemo(
    () => ({
      id: controlId,
      describedBy: [errorId, hintId].filter(Boolean).join(" ") || undefined,
      invalid: Boolean(error),
    }),
    [controlId, errorId, hintId, error],
  );
  return (
    <div data-slot="field" className={cn("grid min-w-0 gap-1.5", className)}>
      <label
        htmlFor={controlId}
        className={cn("text-[13.5px] leading-tight font-semibold", hideLabel && "sr-only")}
      >
        {label}
      </label>
      <FieldContext.Provider value={value}>{children}</FieldContext.Provider>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      {hint ? (
        <p id={hintId} className="hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-center gap-1.5 text-[13px] font-medium text-late-ink">
      <CircleAlert className="size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/** A group of related controls (chips, two time inputs…) with its legend. */
function Fieldset({
  legend,
  hint,
  error,
  errorId,
  className,
  legendClassName,
  children,
}: {
  legend: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  errorId?: string;
  className?: string;
  legendClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className={cn("grid min-w-0 gap-2 border-0 p-0", className)}>
      <legend className={cn("mb-2 p-0 text-[13.5px] leading-tight font-semibold", legendClassName)}>
        {legend}
        {hint ? <span className="hint"> · {hint}</span> : null}
      </legend>
      {children}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </fieldset>
  );
}

const wrapClasses = [
  "flex min-w-0 items-center rounded-control border border-border bg-surface",
  "transition-[border-color,box-shadow]",
  "focus-within:border-brand focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--brand),transparent_72%)]",
  "has-[[aria-invalid=true]]:border-late has-[[aria-invalid=true]]:shadow-[0_0_0_3px_color-mix(in_oklch,var(--late),transparent_80%)]",
];

const controlClasses =
  "h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-base text-fg outline-none placeholder:text-[color-mix(in_oklch,var(--fg-muted),transparent_25%)] disabled:cursor-not-allowed disabled:opacity-60";

type InputProps = React.ComponentProps<"input"> & {
  /** Unit or symbol shown after the value: "km", "h", "€". */
  suffix?: React.ReactNode;
  /** Icon shown before the value (search). */
  icon?: React.ReactNode;
  /** Classes of the outer box; `className` styles the box too, for convenience. */
  wrapperClassName?: string;
};

function Input({ className, wrapperClassName, suffix, icon, ...props }: InputProps) {
  const control = useFieldControl(props);
  return (
    <div
      data-slot="input"
      className={cn(wrapClasses, "h-11 pointer-coarse:h-12", wrapperClassName, className)}
    >
      {icon ? (
        <span className="ml-3 flex text-fg-muted [&_svg]:size-[18px]" aria-hidden>
          {icon}
        </span>
      ) : null}
      <input {...props} {...control} className={cn(controlClasses, icon && "pl-2")} />
      {suffix ? (
        <span className="pr-3 text-sm text-fg-muted" aria-hidden>
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const control = useFieldControl(props);
  return (
    <div data-slot="textarea" className={cn(wrapClasses, className)}>
      <textarea
        rows={2}
        {...props}
        {...control}
        className={cn(controlClasses, "resize-y px-3 py-2.5")}
      />
    </div>
  );
}

/** Native select (the platform picker is the most usable one on phones). */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  const control = useFieldControl(props);
  return (
    <div
      data-slot="select"
      className={cn(wrapClasses, "relative h-11 pointer-coarse:h-12", className)}
    >
      <select
        {...props}
        {...control}
        className={cn(controlClasses, "cursor-pointer appearance-none pr-10")}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 size-[18px] text-fg-muted"
        aria-hidden
      />
    </div>
  );
}

export { Field, FieldError, Fieldset, Input, NativeSelect, Textarea };
