import { forwardRef, type ForwardRefExoticComponent, type RefAttributes } from "react";
import { TextInput, type TextInputInstance, type TextInputProps } from "react-native";

import { colors } from "../tokens.ts";
import { controlStyle, Field, type FieldProps } from "./Field.tsx";

export type TextFieldProps = Omit<TextInputProps, "allowFontScaling" | "style"> &
  Pick<FieldProps, "label" | "hint" | "error" | "required" | "aside" | "id" | "testID">;

/** Labelled single- or multi-line text input. */
export const TextField: ForwardRefExoticComponent<
  TextFieldProps & RefAttributes<TextInputInstance>
> = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, hint, error, required, aside, id, testID, editable = true, multiline, ...rest },
  ref,
) {
  return (
    <Field
      label={label}
      {...(hint === undefined ? {} : { hint })}
      error={error}
      {...(required === undefined ? {} : { required })}
      {...(aside === undefined ? {} : { aside })}
      {...(id === undefined ? {} : { id })}
    >
      {({ invalid, ...control }) => (
        <TextInput
          ref={ref}
          {...(testID === undefined ? {} : { testID })}
          {...control}
          {...rest}
          allowFontScaling
          editable={editable}
          {...(multiline === undefined ? {} : { multiline })}
          placeholderTextColor={colors.subtle}
          style={[
            controlStyle.input,
            multiline === true ? { minHeight: 96, textAlignVertical: "top" as const } : null,
            invalid ? controlStyle.invalid : null,
            editable ? null : controlStyle.disabled,
          ]}
        />
      )}
    </Field>
  );
});
