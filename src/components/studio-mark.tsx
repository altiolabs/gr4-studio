type StudioMarkProps = {
  className?: string;
};

export function StudioMark({ className = 'h-8 w-8' }: StudioMarkProps) {
  return (
    <img alt="" aria-hidden="true" className={className} src="./favicon-32x32.png" loading="eager" />
  );
}
