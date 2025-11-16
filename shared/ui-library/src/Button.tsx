import type { FunctionalComponent, ComponentChildren } from "preact";

interface ButtonProps {
  onClick?: () => void;
  children?: ComponentChildren;
}

const Button: FunctionalComponent<ButtonProps> = ({ onClick, children }) => {
  return (
    <button
      className="bg-brand hover:bg-brand-dark text-theme-inverse font-bold py-2 px-4 rounded"
      onClick={onClick}
    >
      {children}
    </button>
  );
};

export default Button;
