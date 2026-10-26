import { Field, Input } from "@/components/ui/field";

type FormFieldProps = React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  hint?: string;
  error?: string;
};

export function FormField({ name, label, hint, error, ...inputProps }: FormFieldProps) {
  return (
    <Field id={name} label={label} hint={error ? undefined : hint} error={error}>
      <Input name={name} {...inputProps} />
    </Field>
  );
}
