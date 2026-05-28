import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      expand
      visibleToasts={3}
      offset={16}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast: "ec-toast",
          title: "ec-toast-title",
          description: "ec-toast-desc",
          icon: "ec-toast-icon",
          loader: "ec-toast-loader",
          actionButton: "ec-toast-action",
          cancelButton: "ec-toast-cancel",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
