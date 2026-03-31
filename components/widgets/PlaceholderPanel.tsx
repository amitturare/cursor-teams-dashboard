interface PlaceholderPanelProps {
  title: string;
}

export function PlaceholderPanel({ title }: PlaceholderPanelProps) {
  return (
    <div className="widgetPanel widgetPanelPlaceholder">
      <span className="widgetPanelTitle">{title}</span>
      <span className="widgetComingSoon">Coming soon</span>
    </div>
  );
}
