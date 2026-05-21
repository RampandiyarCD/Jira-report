import type { InputHTMLAttributes, ChangeEvent } from "react";

interface Inputprops extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  name?: string;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
  placeholder?: string;
  className?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  labelClassName?: string;
  containerClassName?: string;
}

export const Input = ({
  name,
  type,
  placeholder,
  className,
  value,
  onChange,
  id,
  labelClassName,
  containerClassName,
  ...props
}: Inputprops) => {
  const inputId = id || name?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={containerClassName}>
      {name && (
        <label htmlFor={inputId} className={labelClassName}>
          {name}
        </label>
      )}
      <input
        id={inputId}
        className={className}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        {...props}
      />
    </div>
  );
};
