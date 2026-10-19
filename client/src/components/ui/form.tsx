import * as React from "react"
import * as RHF from "react-hook-form"
import { cn } from "cn"

import { Label } from "@/components/ui/label"

type FormFieldContextValue = {
  id: string
  name: string
  control: RHF.Control<RHF.FieldValues>
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null)

const FormItemContext = React.createContext<{ id: string } | null>(null)

function FormField<
  TFieldValues extends RHF.FieldValues = RHF.FieldValues,
  TName extends RHF.FieldPath<TFieldValues> = RHF.FieldPath<TFieldValues>,
>({
  control,
  name,
  render,
  ...formFieldProps
}: RHF.ControllerProps<TFieldValues, TName> & { id?: string }) {
  return (
    <FormFieldContext.Provider
      value={{
        id: formFieldProps.id ?? name,
        name,
        control: control as RHF.Control<RHF.FieldValues>,
      }}
    >
      <RHF.Controller control={control} name={name} render={render} />
    </FormFieldContext.Provider>
  )
}

function useFormField() {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState } = RHF.useFormContext()
  const formState = RHF.useFormState({ control: fieldContext?.control, name: fieldContext?.name })
  const fieldState = getFieldState(fieldContext?.name ?? "", formState)

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>")
  }
  if (!itemContext) {
    throw new Error("useFormField should be used within <FormItem>")
  }

  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId()
  return (
    <FormItemContext.Provider value={{ id }}>
      <div data-slot="form-item" className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  )
}

function FormLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  const { error, formItemId } = useFormField()
  return (
    <Label
      data-slot="form-label"
      data-error={error ? "" : undefined}
      className={cn("data-[error]:text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  )
}

function FormControl(props: React.ComponentProps<"div">) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()
  return (
    <div
      data-slot="form-control"
      id={formItemId}
      aria-describedby={!error ? formDescriptionId : `${formDescriptionId} ${formMessageId}`}
      aria-invalid={!!error}
      {...props}
    />
  )
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { formDescriptionId } = useFormField()
  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function FormMessage({ className, children, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message ?? "") : children

  if (!body) {
    return null
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn("text-destructive text-sm", className)}
      {...props}
    >
      {body}
    </p>
  )
}

const RHF_METHOD_KEYS = [
  "watch",
  "getValues",
  "getErrors",
  "setError",
  "clearErrors",
  "setValue",
  "getFieldState",
  "resetField",
  "reset",
  "handleSubmit",
  "trigger",
  "unregister",
  "control",
  "register",
  "formState",
  "setFocus",
  "subscribe",
] as const

function Form({
  children,
  ...props
}: React.ComponentProps<"form"> & Record<string, unknown>) {
  const methods: Record<string, unknown> = {}
  const formProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if ((RHF_METHOD_KEYS as readonly string[]).includes(key)) {
      methods[key] = value
    } else {
      formProps[key] = value
    }
  }
  return (
    <RHF.FormProvider {...(methods as unknown as RHF.UseFormReturn)}>
      <form noValidate {...(formProps as React.ComponentProps<"form">)}>
        {children}
      </form>
    </RHF.FormProvider>
  )
}

export { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField }
