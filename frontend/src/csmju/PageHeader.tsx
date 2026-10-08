export default function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="fade-slide-up">
      <h1 className="mb-2 font-display text-headline-lg text-on-surface">{title}</h1>
      <p className="text-body-md text-on-surface-variant">{description}</p>
    </div>
  );
}
