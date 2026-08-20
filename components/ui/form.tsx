"use client";

/**
 * react-hook-form bindings for the shadcn Field primitives.
 *
 * The installed registry ships `Field` but not the classic form wrapper, so
 * this module provides it. The whole point of the file is the accessibility
 * wiring: `FormControl` gives the input a stable id, links the description and
 * the error message through `aria-describedby` and sets `aria-invalid` while
 * an error is present. Nothing about a field state is communicated by colour
 * alone.
 */

import * as React from "react";
import { Slot } from "radix-ui";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const Form = FormProvider;

interface FormFieldContextValue {
  name: string;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

interface FormItemContextValue {
  id: string;
  hasDescription: boolean;
  setHasDescription: (value: boolean) => void;
}

const FormItemContext = React.createContext<FormItemContextValue | null>(null);

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>(props: ControllerProps<TFieldValues, TName, TTransformedValues>) {
  const value = React.useMemo<FormFieldContextValue>(
    () => ({ name: props.name }),
    [props.name]
  );

  return (
    <FormFieldContext.Provider value={value}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const formContext = useFormContext();
  const formState = useFormState({ name: fieldContext?.name ?? "" });

  if (!fieldContext || !itemContext || !formContext) {
    throw new Error(
      "useFormField must be used inside <Form>, <FormField> and <FormItem>."
    );
  }

  const fieldState = formContext.getFieldState(fieldContext.name, formState);
  const { id, hasDescription, setHasDescription } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    hasDescription,
    setHasDescription,
    ...fieldState,
  };
}

function FormItem({ className, ...props }: React.ComponentProps<typeof Field>) {
  const id = React.useId();
  // The description registers itself so that `aria-describedby` never points
  // at an element that was not rendered.
  const [hasDescription, setHasDescription] = React.useState(false);
  const value = React.useMemo<FormItemContextValue>(
    () => ({ id, hasDescription, setHasDescription }),
    [id, hasDescription]
  );

  return (
    <FormItemContext.Provider value={value}>
      <Field data-slot="form-item" className={cn(className)} {...props} />
    </FormItemContext.Provider>
  );
}

function FormLabel({ className, ...props }: React.ComponentProps<typeof FieldLabel>) {
  const { error, formItemId } = useFormField();

  return (
    <FieldLabel
      data-slot="form-label"
      data-error={Boolean(error)}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  );
}

function FormControl(props: React.ComponentProps<typeof Slot.Root>) {
  const { error, formItemId, formDescriptionId, formMessageId, hasDescription } =
    useFormField();

  const describedBy = [
    hasDescription ? formDescriptionId : null,
    error ? formMessageId : null,
  ].filter((value): value is string => value !== null);

  return (
    <Slot.Root
      data-slot="form-control"
      id={formItemId}
      aria-describedby={describedBy.length > 0 ? describedBy.join(" ") : undefined}
      aria-invalid={Boolean(error)}
      {...props}
    />
  );
}

function FormDescription({
  className,
  ...props
}: React.ComponentProps<typeof FieldDescription>) {
  const { formDescriptionId, setHasDescription } = useFormField();

  React.useEffect(() => {
    setHasDescription(true);
    return () => setHasDescription(false);
  }, [setHasDescription]);

  return (
    <FieldDescription
      data-slot="form-description"
      id={formDescriptionId}
      className={cn(className)}
      {...props}
    />
  );
}

function FormMessage({
  className,
  children,
  ...props
}: React.ComponentProps<typeof FieldError>) {
  const { error, formMessageId } = useFormField();
  const message = error?.message;
  const body = message ? String(message) : children;

  if (!body) {
    return null;
  }

  return (
    <FieldError
      data-slot="form-message"
      id={formMessageId}
      className={cn(className)}
      {...props}
    >
      {body}
    </FieldError>
  );
}

export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
};
